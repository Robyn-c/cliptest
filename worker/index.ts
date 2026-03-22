// worker/index.ts
import express from 'express';
import { processHlsClip, uploadClipToStorage } from '@/lib/hls-processor'

const app = express();
app.use(express.json());

app.post('/clip', async (req, res) => {
  const { streamUrl, title } = req.body;
  const clipResult = await processHlsClip({ streamUrl, duration: 30 });
  const url = await uploadClipToStorage(clipResult.filePath, clipResult.id);
  res.json({ url });
});

app.listen(3001);