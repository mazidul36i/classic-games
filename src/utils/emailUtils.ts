// Throwaway-inbox providers. An account is what ties a player to their row on
// the leaderboard, so the register only accepts an address that will still
// reach the person tomorrow.
//
// This list is curated rather than exhaustive — there are thousands of these
// domains and new ones daily. It covers the providers people actually reach for
// first. Deliberately absent are forwarding services like addy.io, SimpleLogin
// and Apple's Hide My Email: those aliases are permanent and belong to a real
// person, so blocking them would turn away legitimate members.
const DISPOSABLE_DOMAINS = new Set([
  // Yopmail and its aliases
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf',
  'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr',

  // Mailinator and its aliases
  'mailinator.com', 'mailinator.net', 'mailinator2.com', 'notmailinator.com',
  'sogetthis.com', 'suremail.info', 'reallymymail.com', 'binkmail.com',
  'bobmail.info', 'chammy.info', 'devnullmail.com', 'letthemeatspam.com',
  'mailin8r.com', 'mailinater.com', 'spamherelots.com', 'tradermail.info',
  'thisisnotmyrealemail.com', 'veryrealemail.com', 'zippymail.info',

  // Guerrilla Mail
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.biz', 'guerrillamail.de', 'guerrillamailblock.com',
  'grr.la', 'sharklasers.com', 'spam4.me', 'pokemail.net',

  // Timed inboxes
  '10minutemail.com', '10minutemail.net', '10minutemail.co.za',
  '10minemail.com', '20minutemail.com', '24hourmail.com',
  'minuteinbox.com', 'one-time.email', 'tempail.com',

  // Temp-Mail and friends
  'temp-mail.org', 'temp-mail.io', 'temp-mail.ru', 'tempmail.com',
  'tempmail.net', 'tempmail.plus', 'tempmailo.com', 'tempr.email',
  'tmpmail.org', 'tmpmail.net', 'tmails.net', 'tempinbox.com',
  'tempemail.net', 'mytemp.email', 'mailtemp.info', 'linshiyouxiang.net',

  // Trash / wegwerf mail
  'trashmail.com', 'trashmail.de', 'trashmail.net', 'trash-mail.com',
  'trash-me.com', 'mailmetrash.com', 'mailnull.com', 'shitmail.me',
  'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
  'wegwerfadresse.de', 'kurzepost.de', 'hidemail.de', 'mailde.de',
  'mailde.info', 'easytrashmail.com', 'spamdecoy.net',

  // Fake-inbox services
  'fakeinbox.com', 'fakemail.net', 'emailfake.com', 'email-fake.com',
  'emailondeck.com', 'emailtemporanea.net', 'dispostable.com',
  'discard.email', 'discardmail.com', 'discardmail.de',
  'throwawaymail.com', 'crazymailing.com', 'nowmymail.com',

  // Catch-all / drop inboxes
  'maildrop.cc', 'mailnesia.com', 'mailcatch.com', 'mailsac.com',
  'mail7.io', 'mail-temporaire.fr', 'mailexpire.com', 'mailmoat.com',
  'mailtothis.com', 'objectmail.com', 'incognitomail.org', 'receiveee.com',
  'getnada.com', 'nada.email', 'getairmail.com', 'inboxbear.com',
  'inboxkitten.com', 'moakt.com', 'mohmal.com', 'luxusmail.org',
  'proxymail.eu', 'rcpt.at', 'byom.de', 'vomoto.com', 'mvrht.net',
  'e4ward.com', '33mail.com', 'burnermail.io',

  // Spam sinks
  'spamgourmet.com', 'spambox.us', 'spam.la', 'spamfree24.org',
  'spambog.com', 'spambog.de', 'spambog.ru',
]);

/** The part after the last `@`, lowercased. Empty when there is no domain. */
export const emailDomain = (email: string): string => {
  const normalised = email.trim().toLowerCase();
  const at = normalised.lastIndexOf('@');
  return at === -1 ? '' : normalised.slice(at + 1);
};

export const isDisposableEmail = (email: string): boolean => {
  const domain = emailDomain(email);
  if (!domain) return false;

  // Several of these hand out per-user subdomains (anything.mailinator.com),
  // so walk the domain's suffixes rather than matching only the whole thing.
  const labels = domain.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(labels.slice(i).join('.'))) return true;
  }
  return false;
};
