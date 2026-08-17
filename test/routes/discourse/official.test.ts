import { beforeEach, describe, expect, it, vi } from 'vitest';

const { destroyMock, getPlaywrightPageMock, gotMock, responseTextMock, gotoMock, setExtraHTTPHeadersMock } = vi.hoisted(() => ({
    destroyMock: vi.fn(),
    getPlaywrightPageMock: vi.fn(),
    gotMock: vi.fn(),
    responseTextMock: vi.fn(),
    gotoMock: vi.fn(),
    setExtraHTTPHeadersMock: vi.fn(),
}));

vi.mock('@/utils/got', () => ({
    default: gotMock,
}));

vi.mock('@/utils/playwright', () => ({
    getPlaywrightPage: getPlaywrightPageMock,
}));

import { fetchOfficialRss } from '@/routes/discourse/official';

describe('Discourse official RSS', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        destroyMock.mockResolvedValue(undefined);
        responseTextMock.mockResolvedValue('<rss>browser</rss>');
        setExtraHTTPHeadersMock.mockResolvedValue(undefined);
        gotoMock.mockResolvedValue({
            ok: () => true,
            status: () => 200,
            text: responseTextMock,
        });
        getPlaywrightPageMock.mockResolvedValue({
            destroy: destroyMock,
            page: {
                goto: gotoMock,
                setExtraHTTPHeaders: setExtraHTTPHeadersMock,
            },
        });
    });

    it('uses the normal HTTP client for non-linux.do Discourse feeds', async () => {
        gotMock.mockResolvedValue({ data: '<rss>http</rss>' });

        await expect(fetchOfficialRss('https://meta.discourse.org/latest.rss', 'secret')).resolves.toBe('<rss>http</rss>');
        expect(gotMock).toHaveBeenCalledWith('https://meta.discourse.org/latest.rss', {
            headers: {
                'User-Api-Key': 'secret',
            },
        });
        expect(getPlaywrightPageMock).not.toHaveBeenCalled();
    });

    it('does not send User-Api-Key when a non-linux.do config has no key', async () => {
        gotMock.mockResolvedValue({ data: '<rss>http</rss>' });

        await fetchOfficialRss('https://meta.discourse.org/latest.rss', '');

        expect(gotMock).toHaveBeenCalledWith('https://meta.discourse.org/latest.rss', {
            headers: undefined,
        });
    });

    it('always uses Chromium for linux.do without trying the HTTP client first', async () => {
        await expect(fetchOfficialRss('https://linux.do/c/news/34.rss')).resolves.toBe('<rss>browser</rss>');

        expect(gotMock).not.toHaveBeenCalled();
        expect(getPlaywrightPageMock).toHaveBeenCalledWith('https://linux.do/c/news/34.rss', {
            closeTimeout: 45_000,
            noGoto: true,
        });
        expect(setExtraHTTPHeadersMock).not.toHaveBeenCalled();
        expect(gotoMock).toHaveBeenCalledWith('https://linux.do/c/news/34.rss', {
            timeout: 30_000,
            waitUntil: 'domcontentloaded',
        });
        expect(destroyMock).toHaveBeenCalledOnce();
    });

    it('preserves User-Api-Key when linux.do is fetched in browser mode', async () => {
        await expect(fetchOfficialRss('https://linux.do/latest.rss', 'secret')).resolves.toBe('<rss>browser</rss>');

        expect(gotMock).not.toHaveBeenCalled();
        expect(setExtraHTTPHeadersMock).toHaveBeenCalledWith({
            'User-Api-Key': 'secret',
        });
    });

    it('propagates browser failures for linux.do', async () => {
        const browserError = new Error('Chromium executable not found');
        getPlaywrightPageMock.mockRejectedValue(browserError);

        await expect(fetchOfficialRss('https://linux.do/latest.rss')).rejects.toBe(browserError);
        expect(gotMock).not.toHaveBeenCalled();
    });
});
