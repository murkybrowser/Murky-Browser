function murkyParseVersion(tag) {
    const m = String(tag || "").trim().match(/^(\d+)\.(\d+)\.(\d+)-Windows$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function murkyCompareVersion(a, b) {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

async function murkyGetLatestWindowsRelease() {
    const response = await fetch(
        "https://api.github.com/repos/murkybrowser/Murky-Browser/releases",
        {
            headers: {
                "Accept": "application/vnd.github+json",
                "User-Agent": "Murky-Browser"
            }
        }
    );

    if (!response.ok) {
        throw new Error(`GitHub release request failed: ${response.status}`);
    }

    const releases = await response.json();

    const valid = releases
        .filter(r => !r.draft && !r.prerelease)
        .map(r => ({ release: r, version: murkyParseVersion(r.tag_name) }))
        .filter(x => x.version);

    valid.sort((a, b) => murkyCompareVersion(b.version, a.version));

    return valid.length ? valid[0] : null;
}
