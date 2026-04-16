const { createLogger, format, transports } = require('winston');

const isDebugEnabled = String(process.env.DEBUG || '').toLowerCase() === 'true';

const logger = createLogger({
	level: isDebugEnabled ? 'debug' : 'info',
	format: format.combine(
		format.timestamp(),
		format.errors({ stack: true }),
		format.splat(),
		format.printf(({ timestamp, level, message, stack }) => {
			const output = stack || message;
			return `${timestamp} [${level}] ${output}`;
		})
	),
	transports: [
		new transports.Console({
			format: format.combine(
				format.colorize(),
				format.timestamp(),
				format.printf(({ timestamp, level, message, stack }) => {
					const output = stack || message;
					return `${timestamp} [${level}] ${output}`;
				})
			),
		}),
	],
});

module.exports = {
	logger,
	isDebugEnabled,
};