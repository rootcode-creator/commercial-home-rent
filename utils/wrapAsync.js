module.exports = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((err) => {
            if (res.headersSent) {
                console.error(err);
                return;
            }
            return next(err);
        });
    };
};