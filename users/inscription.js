const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, initUsersTable } = require('./db');
const { logger } = require('../logger');
const router = express.Router();

router.post('/register', async (req, res) => {
	try {
		const { email, password, roles } = req.body;

		if (!email || !password) {
			logger.warn('Tentative d\'inscription sans email ou password');
			return res.status(400).json({ message: 'email et password requis' });
		}
		if (!roles){
			roles = ['user'];
		}

		await initUsersTable();

		const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
		if (existing.length > 0) {
			logger.warn('Tentative d\'inscription avec email deja utilisé');

			return res.status(409).json({ message: 'Cet email existe deja' });
		}

		const hashedPassword = await bcrypt.hash(password, 10);
		const [result] = await pool.query(
			'INSERT INTO users (email, password, roles) VALUES (?, ?, ?)',
			[email, hashedPassword, roles]
		);

		logger.info('Inscription réussie pour l\'utilisateur: %s', email);
		return res.status(201).json({
			message: 'Compte cree',
			user: {
				id: result.insertId,
				email,
				roles
			},
		});
	} catch (error) {
		logger.error('Erreur lors de l\'inscription: %s', error.message);
		return res.status(500).json({ message: 'Erreur serveur', error: error.message });
	}
});

module.exports = router;

