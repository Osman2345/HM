import InfoPage from '@/components/InfoPage';

export default function PrivacyScreen() {
  return (
    <InfoPage
      eyebrow="SL STAY"
      title="Privacy"
      introduction="SL Stay uses account and booking information to provide its travel and property-partner features."
      sections={[
        {
          heading: 'Information used by the app',
          paragraphs: [
            'This may include account details, saved properties, booking information, and information that property partners provide for their listings. Vendors may also provide business and payout contact details.',
          ],
        },
        {
          heading: 'How information is used',
          paragraphs: [
            'Information supports account access, property discovery, reservations, notifications, and partner operations. Booking details may be available to the relevant accommodation partner so they can fulfill the reservation.',
          ],
        },
        {
          heading: 'Managing your account',
          paragraphs: [
            'You can review your account and booking information in the app. Sign out from the Account page when you are finished using a shared device.',
          ],
        },
      ]}
    />
  );
}
