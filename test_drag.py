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
        
        print("Holding mouse down and moving...")
        await page.mouse.move(400, 300)
        await page.mouse.down()
        for i in range(50):
            await page.mouse.move(400 + i*2, 300)
            await page.wait_for_timeout(50)
        await page.mouse.up()
        await page.wait_for_timeout(1000)
        
        print("Done")
        await browser.close()

asyncio.run(main())
