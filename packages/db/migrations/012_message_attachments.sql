-- Message-Attachment join table (many-to-many)
-- Allows one attachment to be referenced by multiple messages (optional reuse)

CREATE TABLE message_attachments (
  message_id    VARCHAR(20) NOT NULL REFERENCES messages(id),
  attachment_id VARCHAR(20) NOT NULL REFERENCES attachments(id),
  position      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (message_id, attachment_id)
);

CREATE INDEX idx_msg_attachments_attachment ON message_attachments (attachment_id);
