import express from 'express';
import { middleware, logger } from '../src';

const app = express();
app.get('/', () => {
  throw new Error('boom');
});

app.use(middleware());
app.use(logger());

app.listen(5000);
