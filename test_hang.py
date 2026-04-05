import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err}"))
        
        await page.goto("http://localhost:5173/")
        await page.wait_for_timeout(1000)
        
        print("Clicking map to place tile...")
        # Left click
        await page.mouse.click(400, 300)
        await page.wait_for_timeout(1000)
        
        print("Done")
        await browser.close()

asyncio.run(main())
