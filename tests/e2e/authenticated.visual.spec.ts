import { expect, test } from '@playwright/test'
import { captureViewport, hasHorizontalOverflow, openAuthenticatedPage, openFollowableProfile } from './support/app'
import { credentialsFor, projectAuthRole } from './support/auth'

test.beforeEach(({}, testInfo) => {
  const role = projectAuthRole(testInfo.project.metadata)
  test.skip(!credentialsFor(role), `Local credentials are not configured for the ${role} role`)
})

test('@visual authenticated feed fits every supported viewport', async ({ page }, testInfo) => {
  await openAuthenticatedPage(page)
  expect(await hasHorizontalOverflow(page), 'The feed should not scroll horizontally').toBe(false)

  const isCompact = (testInfo.project.use.viewport?.width ?? 0) <= 820
  await expect(page.locator('.mobile-bar')).toBeVisible({ visible: isCompact })
  await expect(page.locator('.side-nav')).toBeVisible({ visible: !isCompact })
  await expect(page.locator('.spinner')).toBeHidden({ timeout: 15_000 })
  await captureViewport(page, testInfo, 'authenticated-feed')
})

test('@visual poll controls remain usable at every supported viewport', async ({ page }, testInfo) => {
  await openAuthenticatedPage(page)
  await expect(page.locator('.spinner')).toBeHidden({ timeout: 15_000 })

  const poll = page.locator('.poll-wrap').first()
  await expect(poll).toBeVisible()
  await poll.scrollIntoViewIfNeeded()

  expect(await hasHorizontalOverflow(page), 'Poll controls should not cause horizontal overflow').toBe(false)
  await expect(poll.locator('.poll-option').first()).toBeVisible()
  await captureViewport(page, testInfo, 'authenticated-poll')
})

test('@visual selected drop type lifts without a red selection outline', async ({ page }, testInfo) => {
  await openAuthenticatedPage(page)
  await page.getByRole('button', { name: 'Create drop' }).click()

  const selectedType = page.locator('.drop-type-card[aria-pressed="true"]')
  await expect(selectedType).toBeVisible()
  await expect(selectedType).toHaveCSS('background-color', 'rgb(17, 17, 17)')
  await expect(selectedType).toHaveCSS('outline-style', 'none')
  await expect(selectedType).not.toHaveCSS('transform', 'none')
  await captureViewport(page, testInfo, 'authenticated-drop-type-selected')
})

test('@visual profile social controls fit every supported viewport', async ({ page }, testInfo) => {
  const foundProfile = await openFollowableProfile(page)
  test.skip(!foundProfile, 'No other profile is currently visible to this test user')

  await expect(page.getByTestId('profile-follow-button')).toBeVisible()
  await expect(page.locator('.profile-social-stat')).toHaveCount(3)
  await expect(page.locator('.profile-social-stat strong')).toHaveText([/\d+/, /\d+/, /\d+/])
  expect(await hasHorizontalOverflow(page), 'Profile social controls should not cause horizontal overflow').toBe(false)
  await captureViewport(page, testInfo, 'authenticated-profile-social')
})

test('@visual mobile contact lists use grouped neobrutalist surfaces', async ({ page }, testInfo) => {
  const viewportWidth = testInfo.project.use.viewport?.width ?? 0
  test.skip(viewportWidth > 600, 'The grouped contact surface is specific to mobile layouts')

  await openAuthenticatedPage(page, '/contacts')

  const suggestions = page.locator('.contacts-mobile-list')
  await expect(suggestions).toBeVisible()
  await expect(suggestions).toHaveCSS('border-top-style', 'solid')
  await expect(suggestions).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  expect(await hasHorizontalOverflow(page), 'Suggestions should not cause horizontal overflow').toBe(false)
  await captureViewport(page, testInfo, 'authenticated-mobile-suggestions')

  await page.getByRole('button', { name: 'Your contacts' }).click()
  const contacts = page.locator('.contacts-mobile-list')
  await expect(contacts).toBeVisible()
  await expect(contacts).toHaveCSS('border-top-style', 'solid')
  await expect(contacts).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  expect(await hasHorizontalOverflow(page), 'Contacts should not cause horizontal overflow').toBe(false)
  await captureViewport(page, testInfo, 'authenticated-mobile-contacts')
})
