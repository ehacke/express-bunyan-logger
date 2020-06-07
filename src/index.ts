import { v4 as uuid } from 'uuid';
import bunyan, { LogLevelString, Stream } from 'bunyan';

interface ExpressLoggerOptionsInterface {
  format?: string;
  name?: string;
  levelFn?: (status: number, err, meta: RequestMetadataInterface) => LogLevelString | undefined;
  logger?: bunyan;
  immediate?: boolean;
  streams?: Stream[];
  stream?: NodeJS.WritableStream;
}

interface RequestMetadataInterface {
  'remote-address': string;
  ip: string;
  method: string;
  url: string;
  'response-time': number;
  'response-hrtime': [number, number];
  'status-code': number;
  'req-headers': Record<string, string>;
  'res-headers': Record<string, string>;
  'http-version': string;
  req: any;
  res: any;
  incoming: string;
}

interface FormatFunctionInterface {
  (meta: RequestMetadataInterface): string;
}

const compile = (fmt: string): FormatFunctionInterface => {
  fmt = fmt.replace(/"/g, '\\"');
  const js = `  return "${fmt.replace(/:([\w-]{2,})(?:\[([^\]]+)])?/g, (_, name, arg) => {
    if (arg) {
      return `"\n + (meta["${name}"] ? (meta["${name}"]["${arg}"]|| (typeof meta["${name}"]["${arg}"] === "number"?"0": "-")) : "-") + "`;
    }
    return `"\n    + ((meta["${name}"]) || (typeof meta["${name}"] === "number"?"0": "-")) + "`;
  })}";`;
  // eslint-disable-next-line no-new-func
  return new Function('meta', js) as FormatFunctionInterface;
};

const defaultLevelFn = (status: number, err): LogLevelString => {
  // eslint-disable-next-line no-magic-numbers
  if (err || status >= 500) {
    // server internal error or error
    return 'error';
  }
  // eslint-disable-next-line no-magic-numbers
  if (status >= 400) {
    // client error
    return 'warn';
  }
  return 'info';
};

const defaultGenReqId = (req): string => {
  const requestId = uuid();
  req.id = requestId;
  return requestId;
};

export const logger = (opts: ExpressLoggerOptionsInterface = {}) => {
  const innerLogger: bunyan =
    opts.logger ||
    bunyan.createLogger({
      name: opts.name || 'express',
      stream: opts.stream,
      streams: opts.streams,
    });

  const {
    immediate,
    levelFn = defaultLevelFn,
    format = ':remote-address :incoming :method :url HTTP/:http-version :status-code :res-headers[content-length] :response-time ms',
  } = opts;

  const formatFunction = compile(format);
  const genReqId = defaultGenReqId;

  // eslint-disable-next-line sonarjs/cognitive-complexity
  return (err, req, res, next) => {
    const startTime = process.hrtime();

    let requestId;

    if (genReqId) {
      requestId = genReqId(req);
    }

    const childLogger = requestId !== undefined ? innerLogger.child({ req_id: requestId }) : innerLogger;
    req.log = childLogger;

    const loggingCallback = (incoming: boolean): void => {
      if (!incoming) {
        res.removeListener('finish', loggingCallback);
        res.removeListener('close', loggingCallback);
      }

      const status = res.statusCode;
      const { method } = req;
      const url = (req.baseUrl || '') + (req.url || '-');
      const httpVersion = `${req.httpVersionMajor}.${req.httpVersionMinor}`;
      const hrtime = process.hrtime(startTime);
      // eslint-disable-next-line no-magic-numbers
      const responseTime = hrtime[0] * 1e3 + hrtime[1] / 1e6;

      const ip =
        req.ip ||
        req.connection.remoteAddress ||
        (req.socket && req.socket.remoteAddress) ||
        (req.socket.socket && req.socket.socket.remoteAddress) ||
        '127.0.0.1';

      const meta: RequestMetadataInterface = {
        'remote-address': ip,
        ip,
        method,
        url,
        'http-version': httpVersion,
        'response-time': responseTime,
        'response-hrtime': hrtime,
        'status-code': status,
        'req-headers': req.headers,
        'res-headers': res.getHeaders(),
        req,
        res,
        incoming: incoming ? '-->' : '<--',
      };

      const level = levelFn(status, err, meta);
      const logFn = level && childLogger[level] ? childLogger[level] : childLogger.info;

      logFn.call(childLogger, meta, formatFunction(meta));
    };

    if (immediate) {
      loggingCallback(true);
    } else {
      res.on('finish', loggingCallback);
      res.on('close', loggingCallback);
    }

    next(err);
  };
};

export const middleware = (opts: ExpressLoggerOptionsInterface = {}) => {
  const loggerInstance = logger(opts);
  return (req, res, next) => loggerInstance(null, req, res, next);
};
