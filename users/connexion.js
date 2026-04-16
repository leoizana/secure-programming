const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, initUsersTable } = require('./db');
const { logger } = require('../logger');
const router = express.Router();

const MAX_LOGIN_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const LOGIN_LOCK_WINDOW_MS = Number(process.env.LOGIN_LOCK_WINDOW_MS || 15 * 60 * 1000);

const loginAttemptsByIp = new Map();
const loginAttemptsByEmail = new Map();

function getClientIp(req) {
	const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
	return forwardedFor || String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function getNormalizedEmail(email) {
	return String(email || '').trim().toLowerCase();
}

function getAttemptState(store, key) {
	const state = store.get(key);
	if (!state) {
		return { count: 0, blockedUntil: 0 };
	}

	if (state.blockedUntil && state.blockedUntil <= Date.now()) {
		store.delete(key);
		return { count: 0, blockedUntil: 0 };
	}

	return state;
}

function isLocked(store, key) {
	const state = getAttemptState(store, key);
	return Boolean(state.blockedUntil && state.blockedUntil > Date.now());
}

function registerFailure(store, key) {
	const state = getAttemptState(store, key);
	const nextCount = state.count + 1;

	if (nextCount >= MAX_LOGIN_ATTEMPTS) {
		store.set(key, {
			count: 0,
			blockedUntil: Date.now() + LOGIN_LOCK_WINDOW_MS,
		});
		return;
	}

	store.set(key, {
		count: nextCount,
		blockedUntil: 0,
	});
}

function resetAttempts(store, key) {
	store.delete(key);
}

router.post('/login', async (req, res) => {
	try {
		const { email, password } = req.body;
		const normalizedEmail = getNormalizedEmail(email);
		const clientIp = getClientIp(req);

		if (isLocked(loginAttemptsByIp, clientIp) || isLocked(loginAttemptsByEmail, normalizedEmail)) {
			logger.warn('Connexion bloquée pour suspicion de force brute: %s / %s', normalizedEmail || 'email inconnu', clientIp);
			return res.status(429).json({
				message: 'Trop de tentatives de connexion. Réessayez plus tard.',
			});
		}

		if (!email || !password) {
			logger.warn('Tentative de connexion sans email ou password');
			return res.status(400).json({ message: 'email et password sont requis' });
		}

		await initUsersTable();

		const [rows] = await pool.query('SELECT id, email, password FROM users WHERE email = ?', [email]);
		if (rows.length === 0) {
			logger.warn('Tentative de connexion avec email non enregistré');
			registerFailure(loginAttemptsByIp, clientIp);
			registerFailure(loginAttemptsByEmail, normalizedEmail);
			return res.status(401).json({ message: 'Identifiants invalides' });
		}

		const user = rows[0];
		const isValidPassword = await bcrypt.compare(password, user.password);
		if (!isValidPassword) {
			logger.warn('Tentative de connexion avec mot de passe incorrect');
			registerFailure(loginAttemptsByIp, clientIp);
			registerFailure(loginAttemptsByEmail, normalizedEmail);
			return res.status(401).json({ message: 'Identifiants invalides' });
		}

		resetAttempts(loginAttemptsByIp, clientIp);
		resetAttempts(loginAttemptsByEmail, normalizedEmail);

		const token = jwt.sign(
			{ id: user.id, email: user.email },
			process.env.JWT_SECRET || 'token',
			{ expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
		);

		logger.info('Connexion réussie pour l\'utilisateur: %s', user.email);
		return res.status(200).json({
			message: 'Connexion reussie',
			token,
		});
	} catch (error) {
		logger.error('Erreur lors de la connexion: %s', error.message);
		return res.status(500).json({ message: 'Erreur serveur', error: error.message });
	}
});

module.exports = router;

