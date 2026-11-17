import { afterEach, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { Link, Profile, type Fetcher } from "@readium/shared";

const { usePublication } = await import("./usePublication");
const { default: publicationReducer } = await import("@/lib/publicationReducer");
const { default: readerReducer } = await import("@/lib/readerReducer");

const previousGlobals = new Map(["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let root: Root | undefined;
let dom: JSDOM | undefined;
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined;
    dom?.window.close();
    for (const [key, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("EPUB positions are loaded once before the publication is exposed and metadata effects do not reload them", async () => {
    dom = new JSDOM("<div id='root'></div>", { url: "https://reader.invalid/" });
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
    const store = configureStore({ reducer: { publication: publicationReducer, reader: readerReducer } });
    let positionReads = 0;
    const url = "https://reader.invalid/book/manifest.json";
    const fetcher = { get(link: Link) { return {
        async link() { return new Link({ href: url }); },
        async readAsJSON() {
            if (link.href.includes("positions.json")) {
                positionReads++;
                return { total: 1, positions: [{ href: "chapter.xhtml", type: "application/xhtml+xml", locations: { position: 1 } }] };
            }
            return { metadata: { title: "Book", conformsTo: [Profile.EPUB], language: "en" },
                links: [{ href: url, rel: "self", type: "application/webpub+json" }, { href: "positions.json", type: "application/vnd.readium.position-list+json" }],
                readingOrder: [{ href: "chapter.xhtml", type: "application/xhtml+xml" }] };
        },
    }; } } as unknown as Fetcher;
    const exposed: number[] = [];
    function Reader() {
        const value = usePublication({ url, fetcher });
        if (value.publication) exposed.push(store.getState().publication.positionsList.length);
        return null;
    }
    root = createRoot(document.getElementById("root")!);
    await act(async () => {
        root!.render(<Provider store={store}><Reader /></Provider>);
        await new Promise(resolve => setTimeout(resolve, 0));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(exposed.length).toBeGreaterThan(0);
    expect(exposed.every(length => length === 1)).toBe(true);
    expect(positionReads).toBe(1);
});
