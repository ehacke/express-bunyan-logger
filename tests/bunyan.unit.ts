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
  it('test logger', (done) => {
    const app = express();
    const output = st();

    app.use(
      middleware({
        stream: output,
      })
    );

    app.get('/', (req, res) => {
      res.send('GET /');
    });

    request(app)
      .get('/')
      .expect('GET /', (err) => {
        if (err) done(err);
        else {
          const json = JSON.parse(output.content.toString());
          assert.equal(json.name, 'express');
          assert.equal(json.url, '/');
          assert.equal(json['status-code'], 200);
          assert(json.res && json.req);
          done();
        }
      });
  });

  it('test 404 statusCode', (done) => {
    const app = express();
    const output = st();
    app.use(
      middleware({
        stream: output,
      })
    );

    request(app)
      .get('/missing')
      .end(() => {
        const json = JSON.parse(output.content.toString());
        assert.equal(json.name, 'express');
        assert.equal(json.url, '/missing');
        assert.equal(json['status-code'], 404);
        assert(json.res && json.req);

        done();
      });
  });

  it('test request id', (done) => {
    const app = express();
    const output = st();
    app.use(
      middleware({
        stream: output,
      })
    );

    app.use((req, res, next) => {
      (req as any).log.info('middleware');
      next();
    });

    app.get('/', (req, res) => {
      res.send('GET /');
    });

    request(app)
      .get('/')
      .expect('GET /', () => {
        const lines = output.content.toString().split('\n');
        assert.equal(lines.length, 3);
        assert.equal(lines[2], '');

        let json = JSON.parse(lines[0]);
        assert.equal(json.name, 'express');
        assert(json.req_id);
        const { req_id } = json;
        assert.equal(json.msg, 'middleware');

        json = JSON.parse(lines[1]);
        assert.equal(json.url, '/');
        assert(json.req_id);
        assert.equal(json.req_id, req_id);
        done();
      });
  });

  it('test errorLogger', (done) => {
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

    request(app)
      .get('/')
      .end(() => {
        const json = JSON.parse(output.content.toString());
        assert.equal(json.name, 'express');
        assert.equal(json.url, '/');
        assert.equal(json['status-code'], 500);

        done();
      });
  });

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
