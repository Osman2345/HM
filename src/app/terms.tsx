import InfoPage from '@/components/InfoPage';

export default function TermsScreen() {
  return (
    <InfoPage
      eyebrow="SL STAY"
      title="Terms of use"
      introduction="These basic terms explain how to use SL Stay. Booking-specific details and property rules shown during a reservation also apply."
      sections={[
        {
          heading: 'Your account',
          paragraphs: [
            'Provide accurate information when creating an account and keep your sign-in details secure. You are responsible for activity carried out through your account.',
          ],
        },
        {
          heading: 'Bookings and property information',
          paragraphs: [
            'Review property descriptions, availability, prices, and any property rules before confirming a booking. Property details are provided by the accommodation partner.',
            'Changes and cancellations depend on the terms shown for the specific booking or property.',
          ],
        },
        {
          heading: 'Property partners',
          paragraphs: [
            'Partners must provide accurate property information and follow the platform requirements. Accounts and listings may be reviewed before approval.',
          ],
        },
      ]}
    />
  );
}
