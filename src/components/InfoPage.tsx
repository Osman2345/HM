import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type InfoSection = {
  heading: string;
  paragraphs: readonly string[];
};

type InfoPageProps = {
  eyebrow: string;
  title: string;
  introduction: string;
  sections: readonly InfoSection[];
  actions?: readonly { label: string; href: Href }[];
};

export default function InfoPage({ eyebrow, title, introduction, sections, actions = [] }: InfoPageProps) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.page}>
        <Link href="/(tabs)" asChild>
          <TouchableOpacity accessibilityRole="link" style={styles.brandLink}>
            <Ionicons name="arrow-back" size={17} color="#4B5563" />
            <Text style={styles.brand}>SL STAY</Text>
          </TouchableOpacity>
        </Link>

        <View style={styles.headingBlock}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.introduction}>{introduction}</Text>
        </View>

        {sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionHeading}>{section.heading}</Text>
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>
            ))}
          </View>
        ))}

        {actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map((action) => (
              <Link key={action.label} href={action.href} asChild>
                <TouchableOpacity accessibilityRole="link" style={styles.actionButton}>
                  <Text style={styles.actionText}>{action.label}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </Link>
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: '#F8FAFC',
  },
  page: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    gap: 18,
  },
  brandLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
  },
  brand: {
    color: '#1F2937',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headingBlock: {
    padding: 26,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  eyebrow: {
    color: '#4B5563',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: '#0F172A',
    fontSize: 30,
    fontWeight: '800',
  },
  introduction: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 23,
  },
  section: {
    padding: 22,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  sectionHeading: {
    color: '#1F2937',
    fontSize: 17,
    fontWeight: '800',
  },
  paragraph: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#374151',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
