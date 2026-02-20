function httpError(status, message, code = undefined) {
  const err = new Error(message)
  err.status = status
  err.code = code
  return err
}

module.exports = httpError
