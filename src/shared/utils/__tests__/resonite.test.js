import { describe, expect, test } from 'vitest';

import {
    getResoniteCurrentSessionHash,
    getResoniteSessionGroupingKey,
    isResoniteContactLike
} from '../resonite';

describe('resonite utils', () => {
    describe('isResoniteContactLike', () => {
        test('returns false for seeded non-contacts that only carry isAccepted false', () => {
            expect(
                isResoniteContactLike({
                    id: 'resonite:U-other',
                    ref: {
                        id: 'resonite:U-other',
                        displayName: 'OtherUser',
                        isAccepted: false
                    },
                    resonite: {
                        userId: 'U-other'
                    }
                })
            ).toBe(false);
        });

        test('returns true for accepted contacts', () => {
            expect(
                isResoniteContactLike({
                    id: 'resonite:U-contact',
                    ref: {
                        id: 'resonite:U-contact',
                        displayName: 'KnownContact',
                        isAccepted: true
                    }
                })
            ).toBe(true);
        });

        test('returns true for pending contacts that still have contact metadata', () => {
            expect(
                isResoniteContactLike({
                    id: 'resonite:U-pending',
                    ref: {
                        id: 'resonite:U-pending',
                        displayName: 'PendingContact',
                        contactStatus: 'Pending',
                        latestMessageTime: '2026-04-20T12:00:00.000Z',
                        isAccepted: false
                    }
                })
            ).toBe(true);
        });
    });

    describe('getResoniteCurrentSessionHash', () => {
        test('prefers snapshot and realtime session hash fields in priority order', () => {
            expect(
                getResoniteCurrentSessionHash({
                    resonite: {
                        currentSessionHash: 'S-primary',
                        realtime: {
                            currentSessionHash: 'S-realtime'
                        }
                    },
                    ref: {
                        resonite: {
                            currentSessionHash: 'S-ref'
                        }
                    }
                })
            ).toBe('S-primary');

            expect(
                getResoniteCurrentSessionHash({
                    resonite: {
                        realtime: {
                            currentSessionHash: 'S-realtime'
                        }
                    }
                })
            ).toBe('S-realtime');
        });

        test('falls back to the current session entry when top-level fields are blank', () => {
            expect(
                getResoniteCurrentSessionHash({
                    resonite: {
                        currentSessionIndex: 0,
                        sessions: [
                            {
                                sessionId: 'S-stable',
                                sessionHash: 'S-from-session-list'
                            }
                        ]
                    }
                })
            ).toBe('S-from-session-list');
        });
    });

    describe('getResoniteSessionGroupingKey', () => {
        test('prefers resolved session id over broadcast key and current session hash', () => {
            expect(
                getResoniteSessionGroupingKey(
                    {
                        resonite: {
                            currentSessionHash: 'S-transient',
                            broadcastKey: 'U-user:room'
                        }
                    },
                    {
                        sessionId: 'R-session-id',
                        broadcastKey: 'U-user:other-room'
                    }
                )
            ).toBe('session:R-session-id');
        });

        test('reuses a preserved stable session id before falling back to transient hashes', () => {
            expect(
                getResoniteSessionGroupingKey(
                    {
                        resonite: {
                            sessionId: 'session-stable-123',
                            currentSessionHash: 'S-transient'
                        }
                    },
                    null
                )
            ).toBe('session:session-stable-123');
        });

        test('falls back to broadcast key before current session hash', () => {
            expect(
                getResoniteSessionGroupingKey(
                    {
                        resonite: {
                            currentSessionHash: 'S-transient'
                        },
                        ref: {
                            resonite: {
                                realtime: {
                                    broadcastKey: 'U-user:shared-room'
                                }
                            }
                        }
                    },
                    null
                )
            ).toBe('broadcast:U-user:shared-room');
        });

        test('falls back to current session hash when no stronger grouping key exists', () => {
            expect(
                getResoniteSessionGroupingKey(
                    {
                        resonite: {
                            currentSessionHash: 'S-transient'
                        }
                    },
                    null
                )
            ).toBe('hash:S-transient');
        });

        test('uses the current session entry session id before falling back to hash', () => {
            expect(
                getResoniteSessionGroupingKey(
                    {
                        resonite: {
                            currentSessionHash: 'S-transient',
                            currentSessionIndex: 0,
                            sessions: [
                                {
                                    sessionId: 'session-from-list',
                                    sessionHash: 'S-transient'
                                }
                            ]
                        }
                    },
                    null
                )
            ).toBe('session:session-from-list');
        });
    });
});
