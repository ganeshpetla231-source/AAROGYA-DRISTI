function errorMiddleware(error, req, res, next) {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal server error';
  let details = error.details || undefined;
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Request validation failed';
    details = Object.values(error.errors).map((item) => ({ field: item.path, message: `Invalid ${item.path}` }));
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${error.path}`;
    details = [{ field: error.path, message: `Invalid ${error.path}` }];
  } else if (error.code === 11000) {
    statusCode = 409;
    const field = Object.keys(error.keyPattern || {})[0] || 'record';
    message = `A record with this ${field} already exists`;
    details = [{ field, message: `A record with this ${field} already exists` }];
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'Uploaded file exceeds the allowed size limit. Choose a smaller file.';
  } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    message = 'Upload one screening image using the image field.';
  } else if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    statusCode = 400;
    message = 'Request body contains invalid JSON';
  }
  res.status(statusCode).json({
    status: 'error',
    message: statusCode === 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
    ...(details && (statusCode < 500 || process.env.NODE_ENV !== 'production') ? { details } : {})
  });
}

module.exports = errorMiddleware;
