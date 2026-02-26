-- Attachment scanning: add 'scanning' status, updated_at for stuck recovery
-- Stuck scanning recovery: attachments in 'scanning' with updated_at > 10 min ago get reverted to 'uploaded'

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
UPDATE attachments SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE attachments ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE attachments ALTER COLUMN updated_at SET NOT NULL;

-- Extend partial index to include scanning for worker queries
DROP INDEX IF EXISTS idx_attachments_status;
CREATE INDEX idx_attachments_status ON attachments (status)
  WHERE status IN ('pending', 'uploaded', 'scanning') AND deleted_at IS NULL;
