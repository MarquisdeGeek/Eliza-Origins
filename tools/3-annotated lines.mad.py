# This script restores the original line numbers to the annotated file

# Vibed with:
# python code to pad each line in a  text file to its longest line + 4 characters, and add a six digit line number (incrementing in 10s, but ignoring blank lines) to the end of every line which does not start with ;

# Then manually patched to cover the eccentricities of lines not included!
    
from pathlib import Path

input_file = Path("2-annotated.mad")
output_file = Path("3-annotated lines.mad")

# Read lines (no trailing newlines)
lines = input_file.read_text(encoding="utf-8").splitlines()

# Longest line length
max_len = max(len(line) for line in lines)
target_len = max_len + 4

line_number = 80
found_start = False
output_lines = []

for line in lines:
    # Handle the skips (manual eyeball check)
    if "Through KEYLST, FOR I=0,1, 1 > 32" in line:
        line_number += 30
    elif line_number == 440 or line_number == 1790:
        line_number += 10
    elif line_number == 1990:
        line_number = 2200


    if found_start:
        pass
    elif "LIST.(TEST)" in line:
        found_start = True
    else:
        output_lines.append(line)
        continue

    padded = line.ljust(target_len)

    if not line.strip():          # blank line
        output_lines.append(padded)
    elif line.startswith(";"):    # comment line
        output_lines.append(padded)
    else:
        output_lines.append(f"{padded}{line_number:06d}")
        line_number += 10

# Write output
output_file.write_text("\n".join(output_lines), encoding="utf-8")
