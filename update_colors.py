import os
import glob
import re

def replace_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Replacements mapping
    replacements = {
        r"'#fff'": "var(--color-bright)",
        r'"#fff"': 'var(--color-bright)',
        r"'rgba\(255,255,255,0.05\)'": "var(--panel-alpha-05)",
        r"'rgba\(255, 255, 255, 0.05\)'": "var(--panel-alpha-05)",
        r"'rgba\(255,255,255,0.1\)'": "var(--panel-alpha-10)",
        r"'rgba\(255, 255, 255, 0.1\)'": "var(--panel-alpha-10)",
        r"'rgba\(255,255,255,0.02\)'": "var(--panel-alpha-02)",
        r"'rgba\(0,0,0,0.1\)'": "var(--panel-dark-10)",
        r"'rgba\(0,0,0,0.2\)'": "var(--panel-dark-20)"
    }

    new_content = content
    for pattern, replacement in replacements.items():
        # Only replace things inside style={{ ... }} roughly by directly substituting the exact string 
        # But wait, these are literal strings in TSX, e.g. color: '#fff'. We just replace '#fff' with 'var(--color-bright)'.
        # Note: in JS, string literals are quoted. So we replace "'#fff'" with "'var(--color-bright)'".
        # Let's adjust replacements to include the quotes!
        # wait, my dict already includes the quotes. But 'var(--color-bright)' needs to be quoted.
        pass

    # Actually, simpler:
    reps = {
        "'#fff'": "'var(--color-bright)'",
        '"#fff"': "'var(--color-bright)'",
        "'rgba(255,255,255,0.05)'": "'var(--panel-alpha-05)'",
        "'rgba(255, 255, 255, 0.05)'": "'var(--panel-alpha-05)'",
        "'rgba(255,255,255,0.1)'": "'var(--panel-alpha-10)'",
        "'rgba(255, 255, 255, 0.1)'": "'var(--panel-alpha-10)'",
        "'rgba(255,255,255,0.2)'": "'var(--panel-alpha-20)'",
        "'rgba(255,255,255,0.02)'": "'var(--panel-alpha-02)'",
        "'rgba(0,0,0,0.1)'": "'var(--panel-dark-10)'",
        "'rgba(0,0,0,0.2)'": "'var(--panel-dark-20)'",
        "'rgba(13, 17, 23, 0.7)'": "var(--glass-bg)", 
        "linear-gradient(to right, #fff,": "linear-gradient(to right, var(--color-bright),",
        "135deg, #fff 0%": "135deg, var(--color-bright) 0%"
    }
    
    for old, new in reps.items():
        new_content = new_content.replace(old, new)
        
    if content != new_content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for f in glob.glob('src/**/*.tsx', recursive=True):
    replace_in_file(f)
for f in glob.glob('src/**/*.css', recursive=True):
    replace_in_file(f)
