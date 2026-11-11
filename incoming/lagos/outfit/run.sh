#!/bin/bash
# Lagos outfit pictures: one image per call, one retry each
cd "$(dirname "$0")"; mkdir -p out
for i in 1 2; do [ -s out/L1_boy_run.png ] && break; ~/tools/gpt-image.sh -o out/L1_boy_run.png -i refs/ref_B_a.png "$(cat prompts/L1_boy_run.txt)"; done
for i in 1 2; do [ -s out/L2_boy_lean_back.png ] && break; ~/tools/gpt-image.sh -o out/L2_boy_lean_back.png -i refs/ref_B_b.png "$(cat prompts/L2_boy_lean_back.txt)"; done
for i in 1 2; do [ -s out/L3_boy_buggy.png ] && break; ~/tools/gpt-image.sh -o out/L3_boy_buggy.png -i refs/ref_B_c.png "$(cat prompts/L3_boy_buggy.txt)"; done
for i in 1 2; do [ -s out/L4_girl_run.png ] && break; ~/tools/gpt-image.sh -o out/L4_girl_run.png -i refs/ref_G_a.png "$(cat prompts/L4_girl_run.txt)"; done
for i in 1 2; do [ -s out/L5_girl_lean_back.png ] && break; ~/tools/gpt-image.sh -o out/L5_girl_lean_back.png -i refs/ref_G_b.png "$(cat prompts/L5_girl_lean_back.txt)"; done
for i in 1 2; do [ -s out/L6_girl_buggy.png ] && break; ~/tools/gpt-image.sh -o out/L6_girl_buggy.png -i refs/ref_G_c.png "$(cat prompts/L6_girl_buggy.txt)"; done
ls -la out
