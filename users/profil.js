const express = require('express');
const jwt = require('jsonwebtoken');
const { pool, initUsersTable } = require('./db');
const { logger } = require('../logger');
const router = express.Router();

function authMiddleware(req, res, next) {
	const authHeader = String(req.headers.authorization || '').trim();
	const bearerMatch = authHeader.match(/Bearer\s+([^,\s]+)/i);
	const headerToken = bearerMatch ? bearerMatch[1] : '';
	const fallbackToken = String(req.headers['x-access-token'] || '').trim();
	const token = (headerToken || fallbackToken || '').replace(/^"|"$/g, '').trim();

	if (!token) {
		logger.warn('Tentative d\'accès sans token');
		return res.status(401).json({ message: 'Token manquant' });
	}

	try {
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'token');
		req.user = payload;
		return next();
	} catch (error) {
		logger.warn('Tentative d\'accès avec token invalide');
		return res.status(401).json({ message: 'Token invalide', error: error.message, token });

	}
}

router.get('/me', authMiddleware, async (req, res) => {
	try {
		await initUsersTable();

		const [rows] = await pool.query(
			'SELECT id, email, roles, created_at FROM users WHERE id = ?',
			[req.user.id]
		);
		logger.info('Profil affiché pour l\'utilisateur: %s', req.user.email);
	

		if (rows.length === 0) {
			logger.warn('Tentative d\'accès à un profil inexistant');
			return res.status(404).json({ message: 'Utilisateur introuvable' });
		}

		return res.status(200).json({ user: rows[0] });
	} catch (error) {
		logger.error('Erreur lors de la récupération du profil: %s', error.message);
		return res.status(500).json({ message: 'Erreur serveur', error: error.message });
	}
});

module.exports = router;

