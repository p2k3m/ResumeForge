
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = __dirname
const clientDistDir = path.join(projectRoot, 'client', 'dist')
const clientIndexPath = path.join(clientDistDir, 'index.html')

const HASHED_INDEX_ASSET_RELATIVE_PATTERN = /^assets\/(?:v[\w.-]+\/)?index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js)$/i

function normalizeClientAssetPath(relativePath) {
    if (typeof relativePath !== 'string') {
        return ''
    }

    const trimmed = relativePath.trim()
    if (!trimmed) {
        return ''
    }

    const withoutLeadingDot = trimmed.replace(/^(?:\.\/)+/, '')
    const withoutLeadingSlash = withoutLeadingDot.replace(/^\/+/, '')
    return withoutLeadingSlash.replace(/\\/g, '/')
}

export function extractHashedIndexAssets(html) {
    if (typeof html !== 'string' || !html.trim()) {
        console.log('HTML is empty or unreadable')
        return []
    }

    const assetPattern =
        /assets\/(?:v[\w.-]+\/)?index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js)(?:\?[^"'\s>]+)?/gi
    const assets = new Set()
    let match
    while ((match = assetPattern.exec(html)) !== null) {
        const [captured] = match
        if (captured) {
            console.log('Captured match:', captured)
            const normalized = normalizeClientAssetPath(captured.replace(/\?.*$/, ''))
            console.log('Normalized:', normalized)
            if (HASHED_INDEX_ASSET_RELATIVE_PATTERN.test(normalized)) {
                console.log('Pattern matched!')
                assets.add(normalized)
            } else {
                console.log('Pattern mismatch!')
            }
        }
    }

    return Array.from(assets)
}

async function run() {
    try {
        const indexHtml = await readFile(clientIndexPath, 'utf8')
        console.log('Read index.html, length:', indexHtml.length)
        const assets = extractHashedIndexAssets(indexHtml)
        console.log('Found assets:', assets)
    } catch (e) {
        console.error(e)
    }
}

run()
