import { Router } from 'express';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest, getErrorMessage } from '../utils';
import { prisma } from '../prisma';
import { validateBody, configValueSchema, bulkConfigSchema, ALLOWED_CONFIG_KEYS } from '../middleware/validate';
import { encryptSecret, decryptSecret } from '../utils/encryption';

interface AppConfigRow {
  id: string;
  key: string;
  value: string;
  updatedAt: Date;
}

const router = Router();

router.use(authenticateToken);
router.use(requireSupervisorAccess);

function isMaskedKey(value: string): boolean {
  if (!value || value.trim() === '') return true;
  const trimmed = value.trim();
  return /^\*+$/.test(trimmed) || trimmed === '(saved)' || trimmed === '(updated)';
}

router.get('/', requireSupervisorAccess, async (_req, res) => {
  try {
    const configs = await prisma.appConfig.findMany();
    const apiKeyRecord = configs.find((c: AppConfigRow) => c.key === 'ai_api_key');
    const hasApiKey = !!(apiKeyRecord && apiKeyRecord.value && apiKeyRecord.value.trim().length > 0);

    const masked = configs.map((c: AppConfigRow) => ({
      ...c,
      // Use a generic fixed mask instead of exposing any portion of the ciphertext.
      // The previous c.value.slice(0,4) was showing ciphertext bytes (not the real key),
      // which was confusing but not a security risk. Using a fixed placeholder is cleaner.
      value: c.key === 'ai_api_key' && c.value ? '••••••••••••' : c.value,
      ...(c.key === 'ai_api_key' ? { hasApiKey } : {}),
    }));

    res.json({ data: masked, meta: { hasApiKey } });
  } catch (error: unknown) {
    console.error('[Config GET /]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to load configuration' });
  }
});

router.put('/:key', requireSupervisorAccess, validateBody(configValueSchema), async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;
    if (!(ALLOWED_CONFIG_KEYS as readonly string[]).includes(key)) {
      return res.status(400).json({ message: `Unknown configuration key: ${key}` });
    }
    const { value } = req.body;

    if (key === 'ai_provider' && !['openai', 'gemini', 'claude', 'groq'].includes(value)) {
      return res.status(400).json({ message: 'Invalid AI provider. Use: openai, gemini, claude, or groq' });
    }

    if (key === 'ai_api_key' && isMaskedKey(value)) {
      return res.status(400).json({ message: 'Cannot save a masked or empty API key. Provide a real key or leave it unchanged.' });
    }

    let finalValue = value;
    if (key === 'ai_api_key' && finalValue && finalValue.length > 0) {
      finalValue = encryptSecret(finalValue);
    }

    const config = await prisma.appConfig.upsert({
      where: { key },
      create: { key, value: finalValue },
      update: { value: finalValue },
    });

    const logValue = key === 'ai_api_key' ? '(updated)' : value;
    await audit(req.user!.id, 'update_config', 'AppConfig', config.id, `Updated ${key} = ${logValue}`);

    res.json({ data: { ...config, value: key === 'ai_api_key' ? '(saved)' : value } });
  } catch (error: unknown) {
    console.error('[Config PUT /:key]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to update configuration' });
  }
});

router.post('/bulk', requireSupervisorAccess, validateBody(bulkConfigSchema), async (req: AuthRequest, res) => {
  try {
    const updates: { key: string; value: string }[] = req.body.updates;

    const safeUpdates = updates.filter(({ key, value }) => {
      if (key === 'ai_api_key') {
        return !isMaskedKey(value);
      }
      return true;
    });

    if (safeUpdates.length === 0) {
      const configs = await prisma.appConfig.findMany();
      return res.json({ data: configs.map((c: AppConfigRow) => ({ ...c, value: c.key === 'ai_api_key' ? '(saved)' : c.value })) });
    }

    const updatePromises = safeUpdates.map(({ key, value }) => {
      let finalValue = value;
      if (key === 'ai_api_key' && finalValue && finalValue.length > 0) {
        finalValue = encryptSecret(finalValue);
      }
      return prisma.appConfig.upsert({ where: { key }, create: { key, value: finalValue }, update: { value: finalValue } });
    });

    const results = await Promise.all(updatePromises);

    await audit(
      req.user!.id,
      'bulk_update_config',
      'AppConfig',
      'bulk',
      `Updated: ${safeUpdates.map((u) => u.key).join(', ')}`,
    );

    res.json({
      data: results.map((c) => ({ ...c, value: c.key === 'ai_api_key' ? '(saved)' : c.value })),
    });
  } catch (error: unknown) {
    console.error('[Config POST /bulk]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to update configuration' });
  }
});

export default router;
