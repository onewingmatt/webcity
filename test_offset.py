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
        
        # Test clicking offset to see if UI takes priority
        await page.mouse.click(100, 100) # This should place a tile on the map
        await page.wait_for_timeout(500)
        
        print("Done")
        await browser.close()

asyncio.run(main())
