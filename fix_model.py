#!/usr/bin/env python3
"""
Fix TensorFlow.js model.json for SeparableConv2D layers.
Removes invalid kernel_initializer, kernel_regularizer, kernel_constraint fields.
"""

import json
import sys
import os

def fix_model(json_path):
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Navigate to layers
    layers = data['modelTopology']['model_config']['config']['layers']
    modified = False
    
    for layer in layers:
        if layer['class_name'] == 'SeparableConv2D':
            config = layer['config']
            # Remove invalid fields
            if 'kernel_initializer' in config:
                del config['kernel_initializer']
                modified = True
            if 'kernel_regularizer' in config:
                del config['kernel_regularizer']
                modified = True
            if 'kernel_constraint' in config:
                del config['kernel_constraint']
                modified = True
    
    if modified:
        # Create backup
        backup_path = json_path + '.bak'
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        print(f'Backup saved to {backup_path}')
        
        # Write fixed model
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        print(f'Fixed model saved to {json_path}')
    else:
        print('No SeparableConv2D layers found or already fixed.')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('Usage: python fix_model.py <model.json>')
        sys.exit(1)
    fix_model(sys.argv[1])