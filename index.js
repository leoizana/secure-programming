require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { initUsersTable } = require('./users/db');
const { logger, isDebugEnabled } = require('./logger');

const inscriptionRoutes = require('./users/inscription');
const connexionRoutes = require('./users/connexion');
const profilRoutes = require('./users/profil');

const app = express();
const STARTUP_DB_RETRY_DELAY_MS = Number(process.env.STARTUP_DB_RETRY_DELAY_MS || 2000);
const STARTUP_DB_MAX_ATTEMPTS = Number(process.env.STARTUP_DB_MAX_ATTEMPTS || 10);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());
app.use(
	morgan(isDebugEnabled ? 'dev' : 'combined', {
		stream: {
			write: (message) => logger.info(message.trim()),
		},
	})
);

if (isDebugEnabled) {
	logger.debug('Mode debug activé');
}

app.get('/', (req, res) => {
	res.json({ message: 'API auth simple en ligne' });
});

app.use('/api', inscriptionRoutes);
app.use('/api', connexionRoutes);
app.use('/api', profilRoutes);

app.use((req, res) => {
	res.status(404).json({ message: 'Route introuvable' });
});

const port = Number(process.env.PORT || 3000);

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initDatabaseWithRetries() {
	let lastError;

	for (let attempt = 1; attempt <= STARTUP_DB_MAX_ATTEMPTS; attempt += 1) {
		try {
			await initUsersTable();
			return;
		} catch (error) {
			lastError = error;
			logger.error('Initialisation BD échouée (tentative %d/%d): %s', attempt, STARTUP_DB_MAX_ATTEMPTS, error.message);
			if (attempt < STARTUP_DB_MAX_ATTEMPTS) {
				await delay(STARTUP_DB_RETRY_DELAY_MS);
			}
		}
	}

	throw lastError;
}

if (require.main === module) {
	(async () => {
		await initDatabaseWithRetries();
		app.listen(port, () => {
			logger.info(`http://localhost:${port}`);
		});
	})().catch((error) => {
		logger.error("Impossible d'initialiser la base de données: %s", error.message);
		process.exit(1);
	});
}

module.exports = app;
