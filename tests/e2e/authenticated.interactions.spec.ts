import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openAuthenticatedPage, openFollowableProfile } from './support/app'
import { credentialsFor, projectAuthRole } from './support/auth'

test.beforeEach(({}, testInfo) => {
  const role = projectAuthRole(testInfo.project.metadata)
  test.skip(!credentialsFor(role), `Local credentials are not configured for the ${role} role`)
})

async function openFirstConversation(page: Page) {
  await openAuthenticatedPage(page, '/nbox')
  await expect(page.locator('.chat-list-loading')).toBeHidden({ timeout: 15_000 })

  const conversations = page.locator('.chat-item-open')
  await expect.poll(() => conversations.count(), { timeout: 5_000 }).toBeGreaterThan(0).catch(() => {})
  test.skip(await conversations.count() === 0, 'This test user has no conversations')

  await conversations.first().click()
  const composer = page.locator('.chat-thread .chat-composer:not(.compact)')
  await expect(composer).toBeVisible()
  return composer
}

test('@smoke reaction menus work without hover', async ({ page }) => {
  await openAuthenticatedPage(page)
  await expect(page.locator('.spinner')).toBeHidden({ timeout: 15_000 })

  const card = page.locator('.box-card').first()
  await expect(card).toBeVisible()

  const voteTrigger = card.locator('.box-action-trigger').nth(0)
  await voteTrigger.focus()
  await page.keyboard.press('Enter')
  await expect(card.getByRole('menu', { name: 'Vote on this post' })).toBeVisible()

  const reactionTrigger = card.locator('.box-action-trigger').nth(1)
  await reactionTrigger.click()
  await expect(card.getByRole('menu', { name: 'React to this post' })).toBeVisible()
})

test('@smoke contacts expose follow controls at every viewport', async ({ page }, testInfo) => {
  await openAuthenticatedPage(page, '/contacts')
  const isMobile = (testInfo.project.use.viewport?.width ?? 0) <= 600

  if (isMobile) {
    await page.getByRole('button', { name: 'Your contacts' }).click()
    const contactRows = page.locator('.contacts-mobile-friend-row')
    await expect.poll(() => contactRows.count(), { timeout: 5_000 }).toBeGreaterThan(0).catch(() => {})
    test.skip(await contactRows.count() === 0, 'This test user has no contacts')
    await contactRows.first().getByRole('button', { name: 'Options' }).click()
    await expect(page.getByTestId('contact-sheet-follow-button')).toBeVisible()
    return
  }

  await page.locator('.contacts-side-panel').getByRole('button', { name: /^All/ }).click()
  const followButtons = page.getByTestId('contact-follow-button')
  await expect.poll(() => followButtons.count(), { timeout: 5_000 }).toBeGreaterThan(0).catch(() => {})
  test.skip(await followButtons.count() === 0, 'This test user has no contacts')
  await expect(followButtons.first()).toBeVisible()
})

test('@smoke emoji picker inserts a native emoji at every viewport', async ({ page }, testInfo) => {
  const composer = await openFirstConversation(page)
  const input = composer.getByRole('textbox', { name: 'Message' })

  await input.fill('Hello world')
  await input.evaluate(element => (element as HTMLInputElement).setSelectionRange(6, 6))
  await composer.getByRole('button', { name: 'Choose emoji' }).click()

  const picker = page.getByRole('dialog', { name: 'Emoji picker' })
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('button', { name: /grinning face/i }).first()).toBeVisible()
  await expect(picker).toBeInViewport()

  const skinToneButton = picker.getByRole('button', { name: /skin tone neutral/i })
  await expect(skinToneButton).toHaveAttribute('title', /skin tone neutral/i)

  const viewportWidth = page.viewportSize()?.width ?? 0
  if (viewportWidth <= 600) {
    const pickerBounds = await picker.boundingBox()
    expect(pickerBounds).not.toBeNull()
    const pickerCenter = (pickerBounds?.x ?? 0) + ((pickerBounds?.width ?? 0) / 2)
    expect(Math.abs(pickerCenter - (viewportWidth / 2))).toBeLessThanOrEqual(1)
  }

  await picker.screenshot({ path: testInfo.outputPath('emoji-picker.png') })
  await page.screenshot({ path: testInfo.outputPath('emoji-picker-page.png') })

  const accessibility = await new AxeBuilder({ page }).include('.emoji-picker-popover').analyze()
  const blocking = accessibility.violations.filter(violation => (
    violation.impact === 'critical' || violation.impact === 'serious'
  ))
  expect(blocking, 'The emoji picker should have no serious accessibility violations').toEqual([])

  await picker.getByRole('button', { name: /grinning face/i }).first().click()
  await expect(input).toHaveValue('Hello 😀world')
  await expect(picker).toHaveCount(0)
  await expect(input).toBeFocused()

  const focusStyle = await input.evaluate(element => {
    const style = getComputedStyle(element)
    return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow }
  })
  expect(focusStyle.outlineStyle).toBe('none')
  expect(focusStyle.boxShadow).not.toBe('none')

  await composer.getByRole('button', { name: 'Choose emoji' }).click()
  await expect(page.getByRole('dialog', { name: 'Emoji picker' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Emoji picker' })).toHaveCount(0)
  await expect(composer.getByRole('button', { name: 'Choose emoji' })).toBeFocused()
})

test('@smoke desktop floating chat keeps the clean red input focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440')
  await openAuthenticatedPage(page)
  const openContact = page.locator('.sidebar-contact-open').first()
  await openContact.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
  test.skip(!await openContact.isVisible().catch(() => false), 'This test user has no sidebar contact')

  const conversationId = '66666666-6666-4666-8666-666666666666'
  await page.route('**/rest/v1/conversations*', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('user_a') && url.searchParams.has('user_b')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: conversationId }) })
      return
    }
    await route.continue()
  })
  await page.route('**/rest/v1/messages*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Content-Range': '*/0' },
    body: '[]',
  }))

  await openContact.click()
  const composer = page.locator('.float-chat .chat-composer.compact')
  const input = composer.getByRole('textbox', { name: 'Message' })
  await expect(composer).toBeVisible()
  await input.focus()

  const focusStyle = await input.evaluate(element => {
    const style = getComputedStyle(element)
    return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow }
  })
  expect(focusStyle.outlineStyle).toBe('none')
  expect(focusStyle.boxShadow).not.toBe('none')
  await expect(composer.getByRole('button', { name: 'Choose emoji' })).toBeVisible()
  await composer.screenshot({ path: testInfo.outputPath('floating-chat-clean-focus.png') })
})

test('@mutation poll selection persists after reload and can be restored', async ({ page }, testInfo) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== 'true', 'Remote mutations require an explicit local opt-in')
  test.skip(testInfo.project.name !== 'desktop-1440', 'Run the remote mutation once, not for every viewport')

  await openAuthenticatedPage(page)
  await expect(page.locator('.spinner')).toBeHidden({ timeout: 15_000 })

  const poll = page.locator('.poll-wrap').first()
  await expect(poll).toBeVisible()

  const options = poll.locator('.poll-option')
  expect(await options.count()).toBeGreaterThan(1)

  const initiallySelected = await options.evaluateAll((buttons) =>
    buttons.findIndex((button) => button.getAttribute('aria-pressed') === 'true'),
  )
  const targetIndex = initiallySelected === 0 ? 1 : 0

  await options.nth(targetIndex).click()
  await expect(options.nth(targetIndex)).toHaveAttribute('aria-pressed', 'true')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.spinner')).toBeHidden({ timeout: 15_000 })
  await expect(page.locator('.poll-wrap').first().locator('.poll-option').nth(targetIndex))
    .toHaveAttribute('aria-pressed', 'true')

  const restoredPoll = page.locator('.poll-wrap').first()
  if (initiallySelected >= 0) {
    await restoredPoll.locator('.poll-option').nth(initiallySelected).click()
    await expect(restoredPoll.locator('.poll-option').nth(initiallySelected))
      .toHaveAttribute('aria-pressed', 'true')
  } else {
    await restoredPoll.locator('.poll-option').nth(targetIndex).click()
    await expect(restoredPoll.locator('.poll-option').nth(targetIndex))
      .toHaveAttribute('aria-pressed', 'false')
  }
})

test('@mutation follow state persists after reload and is restored', async ({ page }, testInfo) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== 'true', 'Remote mutations require an explicit local opt-in')
  test.skip(testInfo.project.name !== 'desktop-1440', 'Run the remote mutation once, not for every viewport')

  const foundProfile = await openFollowableProfile(page, true)
  test.skip(!foundProfile, 'No visible unfollowed profile is currently available to this test user')

  const followButton = page.getByTestId('profile-follow-button')
  await expect(followButton).toBeEnabled()
  await expect(followButton).toHaveAttribute('aria-pressed', 'false')

  await followButton.click()
  await expect(followButton).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.toast')).toContainText('Following')
  await expect(followButton).toBeEnabled()
  await expect(followButton).toHaveAttribute('aria-pressed', 'true')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('profile-follow-button')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('profile-follow-button').click()
  await expect(page.locator('.toast')).toContainText('Unfollowed')
  await expect(page.getByTestId('profile-follow-button')).toBeEnabled()
  await expect(page.getByTestId('profile-follow-button')).toHaveAttribute('aria-pressed', 'false')
})
