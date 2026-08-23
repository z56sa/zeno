// src/api/server.ts

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import whitelistRouter from './routes/whitelist';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

app.use('/whitelist', whitelistRouter);

app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 API Server running on port ${process.env.PORT || 3000}`);
});