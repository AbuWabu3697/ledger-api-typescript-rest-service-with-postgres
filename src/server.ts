import { config } from './config';
import app from './app';

const port = config.port;

app.listen(port, () => {
  console.log(`ledger-api listening on port ${port} [${config.nodeEnv}]`);
});
