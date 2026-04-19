#!/usr/bin/env python3
"""
asl_dataset_generator.py — VisualAI ASL Dataset Generator v2.0
Generates a complete, properly-formatted JSON dataset for all 26 ASL letters
using precise geometric hand models plus data augmentation.

Usage:
  python asl_dataset_generator.py                          # full dataset
  python asl_dataset_generator.py --letter A --variants 10 # single letter
  python asl_dataset_generator.py --augment 20             # augment each base sample
"""

import json
import math
import random
import argparse
import sys
from pathlib import Path
from datetime import date

# ── Geometry Helpers ──────────────────────────────────────────────────────────

def lm(*coords):
    """Create a landmark dict from (x, y, z)."""
    return {"x": round(coords[0], 4), "y": round(coords[1], 4), "z": round(coords[2], 4)}

def rotate_z(lms, angle_deg):
    """Rotate all landmarks around the Z axis (wrist as pivot)."""
    a = math.radians(angle_deg)
    cos_a, sin_a = math.cos(a), math.sin(a)
    out = []
    for p in lms:
        x = p["x"] * cos_a - p["y"] * sin_a
        y = p["x"] * sin_a + p["y"] * cos_a
        out.append(lm(x, y, p["z"]))
    return out

def add_noise(lms, sigma=0.018):
    """Add Gaussian noise to all landmarks."""
    return [lm(
        p["x"] + random.gauss(0, sigma),
        p["y"] + random.gauss(0, sigma),
        p["z"] + random.gauss(0, sigma * 0.5)
    ) for p in lms]

def scale(lms, factor):
    """Scale all landmarks by factor (wrist at origin)."""
    return [lm(p["x"] * factor, p["y"] * factor, p["z"] * factor) for p in lms]

def translate(lms, dx=0, dy=0, dz=0):
    """Translate all landmarks (wrist stays near origin)."""
    return [lm(p["x"] + dx, p["y"] + dy, p["z"] + dz) for p in lms]

def augment(base_lms, n=5, rotate_range=(-10, 10), scale_range=(0.88, 1.12), noise_sigma=0.018):
    """Generate n augmented variants from base landmarks."""
    result = [base_lms]  # variant 1 = clean base
    for _ in range(n - 1):
        aug = base_lms
        aug = rotate_z(aug, random.uniform(*rotate_range))
        aug = scale(aug, random.uniform(*scale_range))
        aug = add_noise(aug, noise_sigma)
        result.append(aug)
    return result

# ── Base Hand Models ─────────────────────────────────────────────────────────
# Coordinate system: wrist at (0,0,0)
# Scale: dist(wrist, middle_MCP) ≈ 1.0
# y-axis: up = negative (screen coords)
# All fingers: MCP → PIP → DIP → TIP
# Thumb:  CMC → MCP → IP → TIP

def make_fist(curl_all=True, thumb_pos="side"):
    """Helper for fist-like shapes."""
    t = {
        "side":    [lm(0.18,-0.08,-0.02), lm(0.25,-0.22,-0.04), lm(0.30,-0.35,-0.05), lm(0.32,-0.42,-0.04)],
        "front":   [lm(0.10,-0.10,-0.04), lm(0.05,-0.24,-0.05), lm(0.02,-0.36,-0.06), lm(0.01,-0.44,-0.06)],
        "up":      [lm(0.20,-0.10,-0.02), lm(0.28,-0.25,-0.04), lm(0.32,-0.37,-0.05), lm(0.34,-0.48,-0.04)],
        "between": [lm(0.14,-0.10,-0.02), lm(0.10,-0.24,-0.03), lm(0.07,-0.36,-0.04), lm(0.05,-0.44,-0.04)],
    }[thumb_pos]
    if curl_all:
        return [
            lm(0,0,0),
            t[0], t[1], t[2], t[3],
            lm(0.22,-0.68,-0.02), lm(0.22,-0.55,-0.03), lm(0.22,-0.48,-0.03), lm(0.22,-0.42,-0.03),
            lm(0.00,-0.72, 0.00), lm(0.00,-0.58, 0.00), lm(0.00,-0.50, 0.00), lm(0.00,-0.44, 0.00),
            lm(-0.20,-0.68,0.02), lm(-0.20,-0.55,0.02), lm(-0.20,-0.47,0.02), lm(-0.20,-0.41,0.02),
            lm(-0.38,-0.60,0.04), lm(-0.38,-0.48,0.04), lm(-0.38,-0.41,0.04), lm(-0.38,-0.36,0.04),
        ]

FINGER_UP = {
    "index":  [lm(0.22,-0.72,0), lm(0.22,-0.90,0), lm(0.22,-1.05,0), lm(0.22,-1.18,0)],
    "middle": [lm(0.00,-0.78,0), lm(0.00,-0.97,0), lm(0.00,-1.12,0), lm(0.00,-1.25,0)],
    "ring":   [lm(-0.20,-0.74,0.02), lm(-0.20,-0.92,0.02), lm(-0.20,-1.06,0.02), lm(-0.20,-1.18,0.02)],
    "pinky":  [lm(-0.38,-0.66,0.04), lm(-0.38,-0.82,0.04), lm(-0.38,-0.96,0.04), lm(-0.38,-1.07,0.04)],
}
FINGER_CURLED = {
    "index":  [lm(0.22,-0.68,-0.02), lm(0.22,-0.55,-0.03), lm(0.22,-0.48,-0.03), lm(0.22,-0.42,-0.03)],
    "middle": [lm(0.00,-0.72, 0.00), lm(0.00,-0.58, 0.00), lm(0.00,-0.50, 0.00), lm(0.00,-0.44, 0.00)],
    "ring":   [lm(-0.20,-0.68,0.02), lm(-0.20,-0.55,0.02), lm(-0.20,-0.47,0.02), lm(-0.20,-0.41,0.02)],
    "pinky":  [lm(-0.38,-0.60,0.04), lm(-0.38,-0.48,0.04), lm(-0.38,-0.41,0.04), lm(-0.38,-0.36,0.04)],
}
THUMB_SIDE =  [lm(0.18,-0.08,-0.02), lm(0.28,-0.15,-0.02), lm(0.40,-0.16,-0.01), lm(0.50,-0.16, 0.00)]
THUMB_TUCK =  [lm(0.12,-0.12,-0.02), lm(0.08,-0.28,-0.03), lm(0.05,-0.40,-0.03), lm(0.02,-0.48,-0.02)]
THUMB_WRAP =  [lm(0.10,-0.10,-0.04), lm(0.05,-0.24,-0.05), lm(0.02,-0.36,-0.06), lm(0.01,-0.44,-0.06)]
THUMB_UP   =  [lm(0.20,-0.10,-0.02), lm(0.26,-0.24,-0.03), lm(0.30,-0.38,-0.04), lm(0.32,-0.50,-0.04)]
THUMB_FWD  =  [lm(0.16,-0.10,-0.02), lm(0.10,-0.24,-0.03), lm(0.06,-0.36,-0.04), lm(0.04,-0.44,-0.04)]

def hand(*finger_groups):
    """Flatten list of landmark groups into a 21-landmark hand array."""
    result = [lm(0, 0, 0)]  # wrist
    for g in finger_groups:
        result.extend(g)
    return result

# ── Letter Definitions ────────────────────────────────────────────────────────

LETTERS = {}

# A — Fist, thumb rests on side of index finger
LETTERS["A"] = {
    "description": "Fist with thumb resting on side of index finger",
    "base": hand(
        THUMB_SIDE,
        FINGER_CURLED["index"], FINGER_CURLED["middle"],
        FINGER_CURLED["ring"],  FINGER_CURLED["pinky"],
    )
}

# B — 4 fingers extended straight, thumb tucked
LETTERS["B"] = {
    "description": "All 4 fingers extended straight up, thumb tucked across palm",
    "base": hand(
        THUMB_TUCK,
        FINGER_UP["index"], FINGER_UP["middle"],
        FINGER_UP["ring"],  FINGER_UP["pinky"],
    )
}

# C — Curved C, gap between thumb and fingers
LETTERS["C"] = {
    "description": "C shape — all fingers curved, open gap between thumb and index",
    "base": [
        lm(0,0,0),
        lm(0.25,-0.10, 0.00), lm(0.38,-0.20,-0.02), lm(0.42,-0.35,-0.02), lm(0.40,-0.48,-0.01),
        lm(0.22,-0.72, 0.00), lm(0.32,-0.80,-0.02), lm(0.36,-0.76,-0.03), lm(0.35,-0.68,-0.02),
        lm(0.00,-0.78, 0.00), lm(0.10,-0.88,-0.02), lm(0.14,-0.85,-0.03), lm(0.14,-0.76,-0.02),
        lm(-0.20,-0.74,0.02), lm(-0.10,-0.83, 0.00), lm(-0.07,-0.81,-0.01), lm(-0.07,-0.72, 0.00),
        lm(-0.38,-0.65,0.04), lm(-0.28,-0.73, 0.02), lm(-0.26,-0.71, 0.01), lm(-0.26,-0.63, 0.02),
    ]
}

# D — Index up, thumb+middle touch, ring+pinky folded
LETTERS["D"] = {
    "description": "Index finger pointing up, thumb tip touching middle fingertip, others folded",
    "base": [
        lm(0,0,0),
        lm(0.20,-0.10, 0.00), lm(0.18,-0.28,-0.02), lm(0.12,-0.42,-0.03), lm(0.08,-0.52,-0.02),
        lm(0.22,-0.72, 0.00), lm(0.22,-0.90, 0.00), lm(0.22,-1.05, 0.00), lm(0.22,-1.18, 0.00),
        lm(0.00,-0.78, 0.00), lm(0.08,-0.66,-0.02), lm(0.12,-0.60,-0.02), lm(0.13,-0.54,-0.02),
        lm(-0.20,-0.74,0.02), lm(-0.20,-0.60, 0.02), lm(-0.20,-0.54, 0.02), lm(-0.20,-0.49, 0.02),
        lm(-0.38,-0.66,0.04), lm(-0.38,-0.53, 0.04), lm(-0.38,-0.47, 0.04), lm(-0.38,-0.42, 0.04),
    ]
}

# E — All fingers curled (claw), thumb tucked under
LETTERS["E"] = {
    "description": "All fingers curled into claw shape, thumb tucked under fingers",
    "base": [
        lm(0,0,0),
        lm(0.14,-0.14,-0.02), lm(0.10,-0.26,-0.03), lm(0.06,-0.36,-0.04), lm(0.04,-0.44,-0.04),
        lm(0.22,-0.72, 0.00), lm(0.26,-0.66,-0.02), lm(0.26,-0.59,-0.03), lm(0.24,-0.53,-0.03),
        lm(0.00,-0.78, 0.00), lm(0.04,-0.72,-0.02), lm(0.04,-0.65,-0.03), lm(0.03,-0.59,-0.03),
        lm(-0.20,-0.74,0.02), lm(-0.16,-0.68, 0.00), lm(-0.16,-0.61,-0.01), lm(-0.17,-0.55,-0.01),
        lm(-0.38,-0.65,0.04), lm(-0.34,-0.59, 0.02), lm(-0.34,-0.53, 0.01), lm(-0.35,-0.48, 0.01),
    ]
}

# F — Index+thumb circle, middle+ring+pinky extended
LETTERS["F"] = {
    "description": "Index + thumb touch forming a circle; middle, ring, and pinky extend upward",
    "base": [
        lm(0,0,0),
        lm(0.22,-0.12, 0.00), lm(0.30,-0.26,-0.02), lm(0.28,-0.38,-0.03), lm(0.22,-0.48,-0.02),
        lm(0.22,-0.72, 0.00), lm(0.24,-0.62,-0.02), lm(0.24,-0.55,-0.03), lm(0.23,-0.50,-0.02),
        lm(0.00,-0.78, 0.00), lm(0.00,-0.96, 0.00), lm(0.00,-1.10, 0.00), lm(0.00,-1.22, 0.00),
        lm(-0.20,-0.74,0.02), lm(-0.20,-0.92, 0.02), lm(-0.20,-1.06, 0.02), lm(-0.20,-1.18, 0.02),
        lm(-0.38,-0.66,0.04), lm(-0.38,-0.82, 0.04), lm(-0.38,-0.95, 0.04), lm(-0.38,-1.06, 0.04),
    ]
}

# G — Index pointing sideways, thumb parallel
LETTERS["G"] = {
    "description": "Index pointing sideways with thumb parallel, other fingers folded",
    "base": [
        lm(0,0,0),
        lm(0.22,-0.10, 0.00), lm(0.36,-0.18,-0.01), lm(0.48,-0.22,-0.01), lm(0.58,-0.24, 0.00),
        lm(0.24,-0.72, 0.00), lm(0.42,-0.72, 0.00), lm(0.55,-0.72, 0.00), lm(0.66,-0.72, 0.00),
        lm(0.00,-0.78, 0.00), lm(0.05,-0.68, 0.00), lm(0.08,-0.62, 0.00), lm(0.10,-0.56, 0.00),
        lm(-0.20,-0.74,0.02), lm(-0.18,-0.64, 0.02), lm(-0.17,-0.58, 0.02), lm(-0.17,-0.52, 0.02),
        lm(-0.38,-0.66,0.04), lm(-0.36,-0.57, 0.04), lm(-0.35,-0.51, 0.04), lm(-0.35,-0.46, 0.04),
    ]
}

# H — Index + middle pointing sideways together
LETTERS["H"] = {
    "description": "Index and middle fingers pointing sideways (horizontal), others folded",
    "base": [
        lm(0,0,0),
        lm(0.22,-0.10, 0.00), lm(0.36,-0.18,-0.01), lm(0.48,-0.22,-0.01), lm(0.58,-0.24, 0.00),
        lm(0.26,-0.72, 0.00), lm(0.44,-0.70, 0.00), lm(0.57,-0.70, 0.00), lm(0.68,-0.70, 0.00),
        lm(0.06,-0.75, 0.00), lm(0.24,-0.73, 0.00), lm(0.37,-0.73, 0.00), lm(0.48,-0.73, 0.00),
        lm(-0.20,-0.74,0.02), lm(-0.18,-0.64, 0.02), lm(-0.17,-0.58, 0.02), lm(-0.17,-0.52, 0.02),
        lm(-0.38,-0.66,0.04), lm(-0.36,-0.57, 0.04), lm(-0.35,-0.51, 0.04), lm(-0.35,-0.46, 0.04),
    ]
}

# I — Only pinky extended
LETTERS["I"] = {
    "description": "Only the pinky finger extended upward, all others folded",
    "base": hand(
        THUMB_TUCK[:2] + [lm(0.08,-0.36,-0.03), lm(0.05,-0.44,-0.03)],
        FINGER_CURLED["index"], FINGER_CURLED["middle"],
        FINGER_CURLED["ring"],  FINGER_UP["pinky"],
    )
}

# J — Like I but thumb also out (J is a motion sign)
LETTERS["J"] = {
    "description": "Pinky extended upward, thumb also extended sideways (sign of J involves a downward hook motion)",
    "base": hand(
        THUMB_SIDE,
        FINGER_CURLED["index"], FINGER_CURLED["middle"],
        FINGER_CURLED["ring"],  FINGER_UP["pinky"],
    )
}

# K — Index + middle up and spread, thumb between them pointing up
LETTERS["K"] = {
    "description": "Index and middle fingers extended and spread, thumb tip between them pointing upward",
    "base": [
        lm(0,0,0),
        lm(0.14,-0.10, 0.00), lm(0.12,-0.26,-0.02), lm(0.10,-0.38,-0.02), lm(0.08,-0.48,-0.02),
        lm(0.22,-0.72, 0.00), lm(0.22,-0.90, 0.00), lm(0.22,-1.05, 0.00), lm(0.22,-1.18, 0.00),
        lm(-0.04,-0.78, 0.00), lm(-0.04,-0.96, 0.00), lm(-0.04,-1.10, 0.00), lm(-0.04,-1.22, 0.00),
        lm(-0.20,-0.74,0.02), lm(-0.20,-0.62, 0.02), lm(-0.20,-0.55, 0.02), lm(-0.20,-0.49, 0.02),
        lm(-0.38,-0.66,0.04), lm(-0.38,-0.54, 0.04), lm(-0.38,-0.47, 0.04), lm(-0.38,-0.42, 0.04),
    ]
}

# L — L shape: index up, thumb sideways far, others folded
LETTERS["L"] = {
    "description": "L-shape: index pointing up, thumb pointing far sideways",
    "base": [
        lm(0,0,0),
        lm(0.20,-0.08, 0.00), lm(0.34,-0.12, 0.00), lm(0.46,-0.14, 0.00), lm(0.57,-0.15, 0.00),
        lm(0.22,-0.72, 0.00), lm(0.22,-0.90, 0.00), lm(0.22,-1.05, 0.00), lm(0.22,-1.18, 0.00),
        lm(0.00,-0.78, 0.00), lm(0.00,-0.66, 0.00), lm(0.00,-0.59, 0.00), lm(0.00,-0.53, 0.00),
        lm(-0.20,-0.74,0.02), lm(-0.20,-0.62, 0.02), lm(-0.20,-0.55, 0.02), lm(-0.20,-0.49, 0.02),
        lm(-0.38,-0.66,0.04), lm(-0.38,-0.54, 0.04), lm(-0.38,-0.47, 0.04), lm(-0.38,-0.42, 0.04),
    ]
}

# M — Three fingers (index+middle+ring) folded over thumb
LETTERS["M"] = {
    "description": "Index, middle, and ring fingers folded down over tucked thumb",
    "base": [
        lm(0,0,0),
        lm(0.10,-0.08,-0.03), lm(0.06,-0.20,-0.04), lm(0.03,-0.30,-0.05), lm(0.01,-0.38,-0.05),
        lm(0.22,-0.72, 0.00), lm(0.22,-0.60,-0.02), lm(0.22,-0.52,-0.02), lm(0.22,-0.46,-0.02),
        lm(0.00,-0.78, 0.00), lm(0.00,-0.65,-0.02), lm(0.00,-0.58,-0.02), lm(0.00,-0.52,-0.02),
        lm(-0.20,-0.74,0.02), lm(-0.20,-0.62, 0.01), lm(-0.20,-0.55, 0.01), lm(-0.20,-0.49, 0.01),
        lm(-0.38,-0.66,0.04), lm(-0.38,-0.55, 0.04), lm(-0.38,-0.49, 0.04), lm(-0.38,-0.44, 0.04),
    ]
}

# N — Two fingers (index+middle) folded over thumb, ring+pinky out slightly
LETTERS["N"] = {
    "description": "Index and middle fingers folded down over tucked thumb; ring and pinky slightly extended",
    "base": [
        lm(0,0,0),
        lm(0.10,-0.08,-0.03), lm(0.06,-0.20,-0.04), lm(0.03,-0.30,-0.05), lm(0.01,-0.38,-0.05),
        lm(0.22,-0.72, 0.00), lm(0.22,-0.60,-0.02), lm(0.22,-0.52,-0.02), lm(0.22,-0.46,-0.02),
        lm(0.00,-0.78, 0.00), lm(0.00,-0.65,-0.02), lm(0.00,-0.58,-0.02), lm(0.00,-0.52,-0.02),
        lm(-0.20,-0.74,0.02), lm(-0.20,-0.64, 0.02), lm(-0.20,-0.58, 0.02), lm(-0.20,-0.53, 0.02),
        lm(-0.38,-0.66,0.04), lm(-0.38,-0.58, 0.04), lm(-0.38,-0.52, 0.04), lm(-0.38,-0.47, 0.04),
    ]
}

# O — Round O: all fingertips meet thumb
LETTERS["O"] = {
    "description": "All fingertips curve down to meet the thumb, forming a circular O shape",
    "base": [
        lm(0,0,0),
        lm(0.24,-0.12, 0.00), lm(0.32,-0.26,-0.02), lm(0.34,-0.40,-0.03), lm(0.30,-0.52,-0.02),
        lm(0.22,-0.72, 0.00), lm(0.28,-0.76,-0.02), lm(0.28,-0.70,-0.03), lm(0.26,-0.62,-0.02),
        lm(0.00,-0.78, 0.00), lm(0.06,-0.84,-0.02), lm(0.06,-0.78,-0.03), lm(0.04,-0.70,-0.02),
        lm(-0.20,-0.74,0.02), lm(-0.14,-0.80, 0.00), lm(-0.14,-0.74,-0.01), lm(-0.16,-0.66, 0.00),
        lm(-0.38,-0.66,0.04), lm(-0.32,-0.70, 0.02), lm(-0.32,-0.64, 0.01), lm(-0.34,-0.58, 0.02),
    ]
}

# P — Like K but fingers pointing downward / forward
LETTERS["P"] = {
    "description": "Like K but hand rotated so fingers point downward; index and middle down, thumb between them",
    "base": [
        lm(0,0,0),
        lm(0.14, 0.10, 0.00), lm(0.12, 0.26,-0.02), lm(0.10, 0.38,-0.02), lm(0.08, 0.48,-0.02),
        lm(0.22, 0.72, 0.00), lm(0.22, 0.90, 0.00), lm(0.22, 1.05, 0.00), lm(0.22, 1.18, 0.00),
        lm(-0.04, 0.78, 0.00), lm(-0.04, 0.96, 0.00), lm(-0.04, 1.10, 0.00), lm(-0.04, 1.22, 0.00),
        lm(-0.20, 0.74,0.02), lm(-0.20, 0.62, 0.02), lm(-0.20, 0.55, 0.02), lm(-0.20, 0.49, 0.02),
        lm(-0.38, 0.66,0.04), lm(-0.38, 0.54, 0.04), lm(-0.38, 0.47, 0.04), lm(-0.38, 0.42, 0.04),
    ]
}

# Q — Like G but index + thumb pointing downward
LETTERS["Q"] = {
    "description": "Like G but hand rotated so index and thumb point downward",
    "base": [
        lm(0,0,0),
        lm(0.22, 0.10, 0.00), lm(0.36, 0.18,-0.01), lm(0.44, 0.26,-0.01), lm(0.46, 0.38, 0.00),
        lm(0.24, 0.72, 0.00), lm(0.42, 0.74, 0.00), lm(0.50, 0.72, 0.00), lm(0.55, 0.66, 0.00),
        lm(0.00, 0.78, 0.00), lm(0.05, 0.68, 0.00), lm(0.08, 0.62, 0.00), lm(0.10, 0.56, 0.00),
        lm(-0.20, 0.74,0.02), lm(-0.18, 0.64, 0.02), lm(-0.17, 0.58, 0.02), lm(-0.17, 0.52, 0.02),
        lm(-0.38, 0.66,0.04), lm(-0.36, 0.57, 0.04), lm(-0.35, 0.51, 0.04), lm(-0.35, 0.46, 0.04),
    ]
}

# R — Index + middle up and crossed over each other
LETTERS["R"] = {
    "description": "Index and middle fingers crossed over each other and pointing up",
    "base": [
        lm(0,0,0),
        lm(0.14,-0.12,-0.02), lm(0.10,-0.28,-0.03), lm(0.06,-0.40,-0.03), lm(0.03,-0.48,-0.02),
        lm(0.22,-0.72, 0.00), lm(0.22,-0.90, 0.00), lm(0.22,-1.05, 0.00), lm(0.22,-1.18, 0.00),
        lm(0.14,-0.72, 0.02), lm(0.14,-0.90, 0.02), lm(0.14,-1.04, 0.02), lm(0.14,-1.16, 0.02),
        lm(-0.20,-0.74,0.02), lm(-0.20,-0.62, 0.02), lm(-0.20,-0.55, 0.02), lm(-0.20,-0.49, 0.02),
        lm(-0.38,-0.66,0.04), lm(-0.38,-0.54, 0.04), lm(-0.38,-0.47, 0.04), lm(-0.38,-0.42, 0.04),
    ]
}

# S — Tight fist, thumb wraps across the front
LETTERS["S"] = {
    "description": "Tight fist with thumb wrapping across the front of the folded fingers",
    "base": hand(
        THUMB_WRAP,
        FINGER_CURLED["index"], FINGER_CURLED["middle"],
        FINGER_CURLED["ring"],  FINGER_CURLED["pinky"],
    )
}

# T — Thumb pokes up between index and middle
LETTERS["T"] = {
    "description": "Thumb inserted between the index and middle fingers, others folded",
    "base": [
        lm(0,0,0),
        lm(0.14,-0.10,-0.02), lm(0.10,-0.24,-0.03), lm(0.06,-0.36,-0.04), lm(0.04,-0.44,-0.04),
        lm(0.22,-0.68,-0.02), lm(0.22,-0.55,-0.03), lm(0.22,-0.48,-0.03), lm(0.22,-0.42,-0.03),
        lm(0.00,-0.72, 0.00), lm(0.00,-0.58, 0.00), lm(0.00,-0.50, 0.00), lm(0.00,-0.44, 0.00),
        lm(-0.20,-0.68,0.02), lm(-0.20,-0.55,0.02), lm(-0.20,-0.47,0.02), lm(-0.20,-0.41,0.02),
        lm(-0.38,-0.60,0.04), lm(-0.38,-0.48,0.04), lm(-0.38,-0.41,0.04), lm(-0.38,-0.36,0.04),
    ]
}

# U — Index + middle up, pressed together (no spread)
LETTERS["U"] = {
    "description": "Index and middle fingers extended upward side by side, fingers close together",
    "base": hand(
        THUMB_TUCK[:2] + [lm(0.06,-0.38,-0.03), lm(0.03,-0.46,-0.02)],
        FINGER_UP["index"], FINGER_UP["middle"],
        FINGER_CURLED["ring"], FINGER_CURLED["pinky"],
    )
}

# V — Index + middle up and spread apart (peace sign)
LETTERS["V"] = {
    "description": "Index and middle fingers spread wide apart pointing upward (peace / victory sign)",
    "base": [
        lm(0,0,0),
        lm(0.14,-0.12,-0.02), lm(0.10,-0.28,-0.03), lm(0.06,-0.40,-0.03), lm(0.03,-0.48,-0.02),
        lm(0.28,-0.72, 0.00), lm(0.28,-0.90, 0.00), lm(0.28,-1.05, 0.00), lm(0.28,-1.18, 0.00),
        lm(-0.08,-0.78, 0.00), lm(-0.08,-0.97, 0.00), lm(-0.08,-1.12, 0.00), lm(-0.08,-1.25, 0.00),
        lm(-0.20,-0.74,0.02), lm(-0.20,-0.62, 0.02), lm(-0.20,-0.55, 0.02), lm(-0.20,-0.49, 0.02),
        lm(-0.38,-0.66,0.04), lm(-0.38,-0.54, 0.04), lm(-0.38,-0.47, 0.04), lm(-0.38,-0.42, 0.04),
    ]
}

# W — Index + middle + ring extended and spread
LETTERS["W"] = {
    "description": "Index, middle, and ring fingers all extended and spread; pinky folded",
    "base": [
        lm(0,0,0),
        lm(0.14,-0.12,-0.02), lm(0.10,-0.28,-0.03), lm(0.06,-0.40,-0.03), lm(0.03,-0.48,-0.02),
        lm(0.30,-0.72, 0.00), lm(0.30,-0.90, 0.00), lm(0.30,-1.05, 0.00), lm(0.30,-1.18, 0.00),
        lm(0.00,-0.78, 0.00), lm(0.00,-0.97, 0.00), lm(0.00,-1.12, 0.00), lm(0.00,-1.25, 0.00),
        lm(-0.28,-0.74,0.02), lm(-0.28,-0.92, 0.02), lm(-0.28,-1.06, 0.02), lm(-0.28,-1.18, 0.02),
        lm(-0.38,-0.66,0.04), lm(-0.38,-0.54, 0.04), lm(-0.38,-0.47, 0.04), lm(-0.38,-0.42, 0.04),
    ]
}

# X — Index hooked (bent at PIP), others folded
LETTERS["X"] = {
    "description": "Index finger hooked (bent at PIP joint into a hook shape), other fingers folded",
    "base": [
        lm(0,0,0),
        lm(0.16,-0.10,-0.02), lm(0.12,-0.26,-0.03), lm(0.08,-0.38,-0.03), lm(0.05,-0.46,-0.03),
        lm(0.22,-0.72, 0.00), lm(0.32,-0.76,-0.02), lm(0.38,-0.70,-0.03), lm(0.36,-0.60,-0.02),
        lm(0.00,-0.78, 0.00), lm(0.00,-0.66,-0.01), lm(0.00,-0.59,-0.01), lm(0.00,-0.53,-0.01),
        lm(-0.20,-0.74,0.02), lm(-0.20,-0.62, 0.01), lm(-0.20,-0.55, 0.01), lm(-0.20,-0.49, 0.01),
        lm(-0.38,-0.66,0.04), lm(-0.38,-0.55, 0.04), lm(-0.38,-0.49, 0.04), lm(-0.38,-0.44, 0.04),
    ]
}

# Y — Thumb + pinky extended (hang loose / shaka)
LETTERS["Y"] = {
    "description": "Thumb and pinky extended outward (hang loose / shaka); index, middle, ring folded",
    "base": [
        lm(0,0,0),
        lm(0.20,-0.08, 0.00), lm(0.34,-0.12, 0.00), lm(0.46,-0.14, 0.00), lm(0.57,-0.15, 0.00),
        lm(0.22,-0.72, 0.00), lm(0.22,-0.60,-0.01), lm(0.22,-0.52,-0.01), lm(0.22,-0.46,-0.01),
        lm(0.00,-0.78, 0.00), lm(0.00,-0.65,-0.01), lm(0.00,-0.58,-0.01), lm(0.00,-0.52,-0.01),
        lm(-0.20,-0.74,0.02), lm(-0.20,-0.61, 0.01), lm(-0.20,-0.54, 0.01), lm(-0.20,-0.48, 0.01),
        lm(-0.38,-0.66,0.04), lm(-0.38,-0.82, 0.04), lm(-0.38,-0.96, 0.04), lm(-0.38,-1.07, 0.04),
    ]
}

# Z — Index up and forward-diagonal (drawing Z), thumb not touching
LETTERS["Z"] = {
    "description": "Index finger pointing forward-diagonally as if drawing the letter Z; others loosely folded",
    "base": [
        lm(0,0,0),
        lm(0.16,-0.10,-0.02), lm(0.12,-0.26,-0.03), lm(0.08,-0.38,-0.03), lm(0.05,-0.46,-0.03),
        lm(0.22,-0.72, 0.00), lm(0.22,-0.90, 0.00), lm(0.22,-1.04, 0.00), lm(0.22,-1.16, 0.00),
        lm(0.00,-0.74, 0.00), lm(0.00,-0.62,-0.01), lm(0.00,-0.55,-0.01), lm(0.00,-0.50,-0.01),
        lm(-0.20,-0.70,0.02), lm(-0.20,-0.58, 0.02), lm(-0.20,-0.52, 0.02), lm(-0.20,-0.47, 0.02),
        lm(-0.38,-0.62,0.04), lm(-0.38,-0.51, 0.04), lm(-0.38,-0.45, 0.04), lm(-0.38,-0.40, 0.04),
    ]
}

# ── Build Dataset ─────────────────────────────────────────────────────────────

def build_dataset(variants_per_letter=10, noise_sigma=0.018, rotate_range=(-12, 12), scale_range=(0.88, 1.12)):
    """Build the complete ASL dataset with augmented variants."""
    samples = []

    for letter in sorted(LETTERS.keys()):
        info = LETTERS[letter]
        base = info["base"]
        variants = augment(base, n=variants_per_letter,
                           rotate_range=rotate_range,
                           scale_range=scale_range,
                           noise_sigma=noise_sigma)

        for i, lms in enumerate(variants):
            samples.append({
                "label": letter,
                "variant": i + 1,
                "description": info["description"] if i == 0 else f"{info['description']} (augmented variant {i+1})",
                "landmarks": lms,
            })

    return samples


def build_json(samples, variants_per_letter):
    """Build the full dataset JSON structure."""
    return {
        "meta": {
            "name": "VisualAI ASL Hand Landmark Dataset",
            "version": "2.0",
            "description": "Synthetically generated + augmented dataset for American Sign Language A–Z recognition using MediaPipe hand landmarks",
            "total_samples": len(samples),
            "landmarks": {
                "count": 21,
                "indices": {str(i): name for i, name in enumerate([
                    "WRIST",
                    "THUMB_CMC", "THUMB_MCP", "THUMB_IP", "THUMB_TIP",
                    "INDEX_MCP", "INDEX_PIP", "INDEX_DIP", "INDEX_TIP",
                    "MIDDLE_MCP", "MIDDLE_PIP", "MIDDLE_DIP", "MIDDLE_TIP",
                    "RING_MCP", "RING_PIP", "RING_DIP", "RING_TIP",
                    "PINKY_MCP", "PINKY_PIP", "PINKY_DIP", "PINKY_TIP",
                ])},
                "coordinate_system": "Normalized: origin at wrist (lm[0]), scale = dist(lm[0], lm[9]). x: right=positive, y: up=negative (screen coords), z: depth",
            },
            "created": str(date.today()),
            "source": f"Synthetically generated from geometric ASL hand models with {variants_per_letter} augmented variants per letter",
        },
        "labels": [chr(65 + i) for i in range(26)],
        "samples": samples,
    }


def to_csv(samples, out_path):
    """Export dataset as a flat CSV for ML training."""
    import csv

    header = ["label"]
    for i in range(21):
        for coord in ["x", "y", "z"]:
            header.append(f"lm{i}_{coord}")

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for s in samples:
            row = [s["label"]]
            for lm in s["landmarks"]:
                row += [lm["x"], lm["y"], lm["z"]]
            writer.writerow(row)

    print(f"  ✓ CSV: {out_path}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="VisualAI ASL Dataset Generator")
    parser.add_argument("--letter",   type=str, default=None,   help="Generate only this letter (A-Z)")
    parser.add_argument("--variants", type=int, default=10,     help="Variants per letter (default: 10)")
    parser.add_argument("--augment",  type=int, default=None,   help="Override augmented variants count")
    parser.add_argument("--noise",    type=float, default=0.018, help="Noise sigma (default: 0.018)")
    parser.add_argument("--no-csv",   action="store_true",       help="Skip CSV export")
    parser.add_argument("--out",      type=str, default=None,   help="Output directory (default: ./dataset)")
    args = parser.parse_args()

    random.seed(42)  # reproducible

    n_variants = args.augment or args.variants
    out_dir = Path(args.out) if args.out else Path(__file__).parent / "dataset"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n  VisualAI ASL Dataset Generator v2.0")
    print(f"  ─────────────────────────────────────")

    if args.letter:
        letter = args.letter.upper()
        if letter not in LETTERS:
            print(f"  ✗ Unknown letter: {letter}")
            sys.exit(1)
        target = {letter: LETTERS[letter]}
    else:
        target = LETTERS

    print(f"  Letters : {list(target.keys())}")
    print(f"  Variants: {n_variants} per letter")
    print(f"  Noise σ : {args.noise}")
    print(f"  Output  : {out_dir}")
    print()

    all_samples = []
    for ltr in sorted(target.keys()):
        info = target[ltr]
        base = info["base"]
        variants = augment(base, n=n_variants, noise_sigma=args.noise)
        for i, lms in enumerate(variants):
            all_samples.append({
                "label": ltr, "variant": i + 1,
                "description": info["description"] if i == 0 else f"{info['description']} (augmented variant {i+1})",
                "landmarks": lms,
            })
        print(f"  ✓ {ltr}  —  {n_variants} variants")

    dataset = build_json(all_samples, n_variants)

    json_path = out_dir / "asl_landmark_dataset.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)
    print(f"\n  ✓ JSON : {json_path}  ({len(all_samples)} samples)")

    if not args.no_csv:
        csv_path = out_dir / "asl_landmark_dataset.csv"
        to_csv(all_samples, csv_path)

    print(f"\n  Done! Total samples: {len(all_samples)}")
    print()


if __name__ == "__main__":
    main()
