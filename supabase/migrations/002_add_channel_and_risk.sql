-- Add channel and risk_level columns to messages table.
-- channel tracks where the message originated (sms, web, future_whatsapp).
-- risk_level on outbound messages records what risk was assessed.

alter table messages
  add column if not exists channel text not null default 'web'
    check (channel in ('sms', 'web', 'future_whatsapp'));

alter table messages
  add column if not exists risk_level text
    check (risk_level is null or risk_level in ('low', 'medium', 'high'));

create index if not exists idx_messages_channel on messages (channel);
