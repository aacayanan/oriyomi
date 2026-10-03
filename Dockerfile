FROM python:3.12-slim

WORKDIR /app

# Install ffmpeg for audio concatenation (lossless MP3 merge)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py tts.py tts_chunks.py text_structure.py summaries.py ./

EXPOSE 8000

# Long keep-alive + no hard concurrency cap: fold responses are large base64
# JSON and the client pools requests; abrupt closes surface as proxy resets.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "75"]