/* THE PHONE PATH, WHICH NOBODY HERE CAN CLICK.
 *
 * There is no iPhone attached to this project and the browser used to check
 * layout has no wallet app behind it, so the mobile connect flow cannot be
 * exercised the way the desktop one can. What can be pinned is the part that
 * decides where somebody is sent: the platform read off a real user agent, and
 * the exact universal link built from it.
 *
 * That matters more than usual because a wrong link here is not a broken
 * button, it is somebody dropped on a blank page inside an app they just
 * opened, with no way back to the pool they were joining.
 *
 * The user agent strings below are real ones, not sketches.
 */

import { expect } from "chai";

import {
  detectPlatform,
  inWalletBrowser,
  isIpadPretendingToBeAMac,
  MOBILE_WALLETS,
  storeFor,
} from "../src/lib/mobile";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  phantomInApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Phantom/25.10.0",
};

describe("the mobile connect path", () => {
  describe("knowing which phone this is", () => {
    it("reads an iPhone in Safari", () => {
      expect(detectPlatform(UA.iphoneSafari)).to.equal("ios");
    });

    /* CHROME ON IOS IS STILL IOS. It is WebKit underneath and the App Store is
     * still where the wallet comes from — sending somebody to Google Play
     * because the string said "CriOS" would be a dead end. */
    it("reads Chrome on an iPhone as iOS, not as Chrome", () => {
      expect(detectPlatform(UA.iphoneChrome)).to.equal("ios");
    });

    it("reads an Android phone", () => {
      expect(detectPlatform(UA.androidChrome)).to.equal("android");
    });

    /* An Android tablet's UA says neither "mobile" nor anything iOS-shaped.
     * Testing for "mobile" would have called this a desktop. */
    it("reads an Android tablet, which never says mobile", () => {
      expect(detectPlatform(UA.androidTablet)).to.equal("android");
    });

    it("leaves real desktops alone", () => {
      expect(detectPlatform(UA.macSafari)).to.equal("desktop");
      expect(detectPlatform(UA.windowsChrome)).to.equal("desktop");
    });

    /* iPadOS 13+ reports itself as a Mac, deliberately, and the only tell is a
     * touch screen. Without this an iPad gets the desktop message telling it to
     * install a browser extension it cannot have. */
    it("catches an iPad pretending to be a Mac", () => {
      expect(isIpadPretendingToBeAMac(UA.macSafari, 5)).to.equal(true);
      expect(isIpadPretendingToBeAMac(UA.macSafari, 0)).to.equal(false);
      expect(isIpadPretendingToBeAMac(UA.windowsChrome, 5)).to.equal(false);
    });
  });

  describe("already inside a wallet", () => {
    /* The loop worth avoiding: offering "open in Phantom" to somebody who is
     * reading the page inside Phantom. */
    it("recognises a wallet's own browser", () => {
      expect(inWalletBrowser(UA.phantomInApp)).to.equal(true);
    });

    it("does not mistake an ordinary phone browser for one", () => {
      expect(inWalletBrowser(UA.iphoneSafari)).to.equal(false);
      expect(inWalletBrowser(UA.androidChrome)).to.equal(false);
    });
  });

  describe("the universal links", () => {
    const HREF = "https://commish.fun/p/4keR41tUNec3k7PrMMF61fXE9N7iGfQEEzERtbJSgq2j";
    const ORIGIN = "https://commish.fun";

    it("builds Phantom's exactly as its own adapter does", () => {
      const phantom = MOBILE_WALLETS.find((w) => w.id === "phantom")!;
      expect(phantom.browse!(HREF, ORIGIN)).to.equal(
        `https://phantom.app/ul/browse/${encodeURIComponent(HREF)}?ref=${encodeURIComponent(ORIGIN)}`,
      );
    });

    it("builds Solflare's as its documentation specifies", () => {
      const solflare = MOBILE_WALLETS.find((w) => w.id === "solflare")!;
      expect(solflare.browse!(HREF, ORIGIN)).to.equal(
        `https://solflare.com/ul/v1/browse/${encodeURIComponent(HREF)}?ref=${encodeURIComponent(ORIGIN)}`,
      );
    });

    /* THE POOL ADDRESS MUST SURVIVE THE TRIP. The link somebody follows is a
     * pool page, and an unencoded query or slash would truncate the target and
     * land them on the home page having lost the pool they were invited to. */
    it("encodes the target so a deep link keeps its path", () => {
      for (const w of MOBILE_WALLETS) {
        const link = w.browse!(HREF, ORIGIN);
        expect(link, w.name).to.contain(encodeURIComponent(HREF));
        /* The raw URL must NOT appear: that would mean it went in unencoded. */
        expect(link.split("?ref=")[0], w.name).to.not.contain("://commish.fun");
      }
    });

    it("survives a url that already carries a query string", () => {
      const tricky = "https://commish.fun/p/abc?join=1&ref=x";
      for (const w of MOBILE_WALLETS) {
        const link = w.browse!(tricky, ORIGIN);
        const target = decodeURIComponent(
          link.slice(link.indexOf("/browse/") + 8).split("?ref=")[0],
        );
        expect(target, w.name).to.equal(tricky);
      }
    });
  });

  describe("the stores", () => {
    it("sends an iPhone to the App Store and an Android to Play", () => {
      for (const w of MOBILE_WALLETS) {
        expect(storeFor(w, "ios"), w.name).to.contain("apps.apple.com");
        expect(storeFor(w, "android"), w.name).to.contain("play.google.com");
      }
    });

    it("has a store link for every wallet it offers", () => {
      for (const w of MOBILE_WALLETS) {
        expect(w.store.ios, `${w.name} ios`).to.match(/^https:\/\//);
        expect(w.store.android, `${w.name} android`).to.match(/^https:\/\//);
      }
    });

    /* Every wallet listed must be openable, or it is a store link with no way
     * to come back. That rule is why this list is two wallets and not the four
     * on /wallet. */
    it("offers no wallet it cannot open", () => {
      for (const w of MOBILE_WALLETS) {
        expect(w.browse, `${w.name} has no browse link`).to.be.a("function");
      }
    });
  });
});
