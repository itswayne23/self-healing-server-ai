FROM python:3.11-slim

WORKDIR /app

RUN mkdir -p /data

RUN apt-get update && apt-get install -y iputils-ping && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*


COPY app.py .

COPY attacker /attacker

CMD ["python", "app.py"]
