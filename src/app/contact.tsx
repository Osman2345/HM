import InfoPage from '@/components/InfoPage';

export default function ContactScreen() {
  return (
    <InfoPage
      eyebrow="CONTACT"
      title="How can we help?"
      introduction="Start with the part of SL Stay that can help with your question."
      sections={[
        {
          heading: 'Questions about a booking',
          paragraphs: [
            'Open your bookings to review reservation details. Keeping your booking information available will help you when asking a property about your stay.',
          ],
        },
        {
          heading: 'Vendor and property questions',
          paragraphs: [
            'Sign in to your partner account to manage your properties and bookings. If you are new to SL Stay, you can start a vendor application from the sign-in page.',
          ],
        },
      ]}
      actions={[
        { label: 'View bookings', href: '/(tabs)/bookings' },
        { label: 'Partner sign in', href: '/login?audience=vendor' },
      ]}
    />
  );
}
