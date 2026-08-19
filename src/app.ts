import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import authRouter from './routes/auth';
import accountsRouter from './routes/accounts';
import transactionsRouter from './routes/transactions';

const app = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRouter);
app.use('/accounts', accountsRouter);
app.use('/transactions', transactionsRouter);

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
