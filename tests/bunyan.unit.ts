import express from 'express';
import { assert } from 'chai';
import request from 'supertest';
import through from 'through2';
import { logger, middleware } from '../src';

/**
 *
 */
function st() {
  return through(function (chunk, enc, next) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (this.content) this.content = Buffer.concat([this.content, chunk]);
    else {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.content = chunk;
    }
    next();
  });
}

describe('bunyan-logger', () => {
  it('errorLogger should call next error middleware', (done) => {
    let middlewareCalled = false;
    const app = express();
    const output = st();

    app.get('/', () => {
      throw new Error();
    });

    app.use(
      logger({
        stream: output,
      })
    );

    app.use((err, req, res, next) => {
      middlewareCalled = true;
      next(err);
    });

    request(app)
      .get('/')
      .end(() => {
        if (!middlewareCalled) {
          throw new Error('middleware was not called');
        }
        done();
      });
  });

  it('test options.levelFn', (done) => {
    const app = express();
    const output = st();
    app.use(
      middleware({
        stream: output,
        levelFn(status, err, meta) {
          if (meta && meta['response-time'] !== undefined) {
            return 'fatal';
          }

          // eslint-disable-next-line unicorn/no-useless-undefined
          return undefined;
        },
      })
    );

    app.get('/', (req, res) => {
      res.send('GET /');
    });

    request(app)
      .get('/')
      .expect('error level fatal', () => {
        const json = JSON.parse(output.content.toString());
        assert.equal(json.level, 60);
        done();
      });
  });
});
