FROM python:3.12-slim

WORKDIR /app

# Install ffmpeg for audio concatenation (lossless MP3 merge)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py tts.py celery_app.py tts_chunks.py tts_worker.py text_structure.py ./

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]