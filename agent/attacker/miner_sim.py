import os
import time
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--duration", type=int, default=120, help="Run time in seconds")
parser.add_argument("--label", type=str, default="malicious", help="ground truth label")
args = parser.parse_args()

pid = os.getpid()

print(f"[MINER] Started | PID={pid} | label={args.label} | duration={args.duration}s")

start = time.time()

while True:
    # CPU burn
    x = 0
    for i in range(500000):
        x += i * i

    if time.time() - start > args.duration:
        print(f"[MINER] Completed duration. PID={pid}")
        break

