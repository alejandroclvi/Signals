# App Store And Google Play Reviews Producer Research

Last checked: 2026-04-18

## Signal Role

App store reviews are buyer/user-experience evidence. They are strong for frustration, feature gaps, switching language, pricing complaints, and repeated product issues.

## Programmatic Access Specs

Official access paths:

- App Store Connect API: https://developer.apple.com/documentation/appstoreconnectapi
- Apple Customer Reviews API: https://developer.apple.com/documentation/appstoreconnectapi/customer-reviews
- Apple list customer reviews endpoint: https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-customerreviews
- Google Play Developer API quotas: https://developers.google.com/android-publisher/quotas
- Google Play Reply to Reviews API: https://developers.google.com/android-publisher/reply-to-reviews
- Google Play reviews resource: https://developers.google.com/android-publisher/api-ref/rest/v3/reviews

Apple useful data:

- customer reviews for your app
- review rating, title, body, reviewer nickname, created date, territory
- filters by rating and territory
- customer review responses

Google Play useful data:

- reviews for production versions of your app
- reviews with comments
- star rating and text
- device metadata
- language
- developer responses
- review list/get/reply methods

Google Play quotas:

- Default API quota buckets are generally 3,000 queries/minute by bucket.
- Reply to Reviews API has stricter per-app quotas:
  - GET reviews: 200/hour
  - POST replies: 2,000/day

## Limitations

- Official Apple and Google APIs mostly expose reviews for apps you own or manage.
- They are not broad competitor-review APIs.
- Google Play API exposes only reviews with comments for production apps.
- Access requires App Store Connect or Google Play Console permissions.

## Blockers

- High blocker for broad market/competitor review monitoring through official APIs.
- Good fit for owned-product monitoring, weak fit for external signal discovery.
- Competitor review data would require licensed third-party data or non-official scraping, which should be avoided until legal review.

## Recommended Approach

Use this producer later for owned app/customer monitoring.

For market-level signals:

- consider licensed review-data providers
- do not assume official app store APIs can monitor competitors

## Source Links

- https://developer.apple.com/documentation/appstoreconnectapi
- https://developer.apple.com/documentation/appstoreconnectapi/customer-reviews
- https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-customerreviews
- https://developers.google.com/android-publisher/quotas
- https://developers.google.com/android-publisher/reply-to-reviews
- https://developers.google.com/android-publisher/api-ref/rest/v3/reviews

