/* ================================================================
   METTLESTATE × EA FC MOBILE — discord.js v2
   Discord webhook notifications
   Webhook URL is now stored server-side in settings
================================================================ */

async function sendDiscordWebhook(data) {
  const webhookUrl = window._discordWebhookFromServer
    || Storage.loadDiscordWebhook()
    || '';
  if (!webhookUrl) return;

  const embeds = [];

  switch (data.type) {
    case 'result': {
      const hp = getPlayer(data.home);
      const ap = getPlayer(data.away);
      const hName = hp?.name || data.home;
      const aName = ap?.name || data.away;
      const resultLabel = data.result === 'draw'
        ? '🤝 Draw'
        : `🏆 ${data.result === 'home' ? hName : aName} wins`;

      embeds.push({
        title: `⚽ Result: ${hName} vs ${aName}`,
        description: `**${hName}** **${data.homeGoals}** — **${data.awayGoals}** **${aName}**\n${resultLabel}`,
        color: data.result === 'draw' ? 0xFFD700 : data.result === 'home' ? 0x00E5FF : 0xFF4D4D,
        timestamp: new Date().toISOString(),
        footer: { text: 'Mettlestate × EA FC Mobile League' },
        image: data.imageUrl ? { url: data.imageUrl } : undefined,
      });
      break;
    }

    case 'forfeit': {
      embeds.push({
        title: `🚫 Forfeit`,
        description: `**${data.forfeiter}** forfeited against **${data.winner}**\nResult: ${data.homeGoals}–${data.awayGoals}`,
        color: 0xFF4D4D,
        timestamp: new Date().toISOString(),
        footer: { text: 'Mettlestate × EA FC Mobile League' },
      });
      break;
    }

    case 'postponed': {
      const hp = getPlayer(data.home);
      const ap = getPlayer(data.away);
      const byP = getPlayer(data.by);
      embeds.push({
        title: `⏸ Fixture Postponed`,
        description: `**${hp?.name || data.home}** vs **${ap?.name || data.away}** postponed by **${byP?.name || data.by}**`,
        color: 0xFFA500,
        timestamp: new Date().toISOString(),
        footer: { text: 'Mettlestate × EA FC Mobile League' },
      });
      break;
    }

    case 'playerAdded': {
      embeds.push({
        title: `✅ New Player`,
        description: `**${data.name}** (@${data.username}) has joined the league!`,
        color: 0x00E676,
        timestamp: new Date().toISOString(),
        footer: { text: 'Mettlestate × EA FC Mobile League' },
      });
      break;
    }

    case 'playerRemoved': {
      embeds.push({
        title: `❌ Player Removed`,
        description: `**${data.name}** (@${data.username}) was removed from the league.`,
        color: 0xFF4D4D,
        timestamp: new Date().toISOString(),
        footer: { text: 'Mettlestate × EA FC Mobile League' },
      });
      break;
    }

    case 'suspension': {
      embeds.push({
        title: data.suspended ? `🔴 Player Suspended` : `🟢 Player Reactivated`,
        description: `**${data.player}** has been ${data.suspended ? 'suspended' : 'reactivated'}.`,
        color: data.suspended ? 0xFF4D4D : 0x00E676,
        timestamp: new Date().toISOString(),
        footer: { text: 'Mettlestate × EA FC Mobile League' },
      });
      break;
    }

    case 'fixturesGenerated': {
      embeds.push({
        title: `📅 Fixtures Generated`,
        description: `**${data.count}** fixtures have been generated for the new season.`,
        color: 0x00E5FF,
        timestamp: new Date().toISOString(),
        footer: { text: 'Mettlestate × EA FC Mobile League' },
      });
      break;
    }

    case 'playersImported': {
      embeds.push({
        title: `📥 Players Imported`,
        description: `**${data.count}** players imported. Total: **${data.total}**`,
        color: 0x00E676,
        timestamp: new Date().toISOString(),
        footer: { text: 'Mettlestate × EA FC Mobile League' },
      });
      break;
    }
  }

  if (!embeds.length) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds }),
    });
  } catch (err) {
    console.warn('[Discord webhook failed]', err.message);
  }
}

// ── Send test ping ────────────────────────────────────────────
async function testDiscordWebhook(url) {
  if (!url) { toast('Enter a webhook URL first.', 'error'); return false; }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '✅ Webhook Connected',
          description: 'Mettlestate × EA FC Mobile League admin panel is connected!',
          color: 0x00E5FF,
          timestamp: new Date().toISOString(),
          footer: { text: 'Mettlestate × EA FC Mobile League' },
        }],
      }),
    });
    if (res.status === 204 || res.ok) {
      toast('Webhook test sent!', 'success');
      return true;
    }
    toast(`Webhook error: ${res.status}`, 'error');
    return false;
  } catch {
    toast('Could not reach Discord webhook.', 'error');
    return false;
  }
}
