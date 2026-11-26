import InfoPage from '@/components/InfoPage';

export default function AboutScreen() {
  return (
    <InfoPage
      eyebrow="ABOUT SL STAY"
      title="Stay local. Feel at home."
      introduction="SL Stay helps travellers discover places to stay across Sierra Leone and gives local accommodation partners a place to share their properties."
      sections={[
        {
          heading: 'Find your next stay',
          paragraphs: [
            'Explore hotel listings, compare details, save properties you like, and keep track of your bookings from your account.',
          ],
        },
        {
          heading: 'For local partners',
          paragraphs: [
            'Accommodation providers can apply to list their properties. Vendor accounts and listings may be reviewed before they become active.',
          ],
        },
      ]}
    />
  );
}
