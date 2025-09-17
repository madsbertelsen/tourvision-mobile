import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Svg, { Line, Circle, Path } from 'react-native-svg';

const COLORS = {
  blue: '#58a6ff',
  purple: '#8B5CF6',
  green: '#3fb950',
  red: '#f85149',
  orange: '#F97316',
  background: '#161b22',
  border: '#30363d',
  text: '#c9d1d9',
};

type Traveler = 'Alex' | 'Sam' | 'Maya' | 'Jordan';

interface Activity {
  location: string;
  startTime: number;
  duration: number;
}

// Define the journey data with time
const journeyData = {
  Alex: [
    { location: 'Hotel Casa Fuster', startTime: 0, duration: 2 },
    { location: 'Gothic Quarter', startTime: 2, duration: 4 },
    { location: 'Boqueria Market', startTime: 6, duration: 2 },
    { location: 'Casa Batlló', startTime: 8, duration: 2 },
    { location: 'Las Ramblas', startTime: 10, duration: 2 }
  ],
  Sam: [
    { location: 'Hotel Casa Fuster', startTime: 0, duration: 2 },
    { location: 'Gothic Quarter', startTime: 2, duration: 4 },
    { location: 'Boqueria Market', startTime: 6, duration: 2 },
    { location: 'Casa Batlló', startTime: 8, duration: 2 },
    { location: 'Las Ramblas', startTime: 10, duration: 2 }
  ],
  Maya: [
    { location: 'Hotel Casa Fuster', startTime: 0, duration: 2 },
    { location: 'Barceloneta Beach', startTime: 2, duration: 3 },
    { location: 'Boqueria Market', startTime: 6, duration: 2 },
    { location: 'Las Ramblas', startTime: 10, duration: 2 }
  ],
  Jordan: [
    { location: 'Hotel Casa Fuster', startTime: 0, duration: 2 },
    { location: 'Park Güell', startTime: 2, duration: 4 },
    { location: 'Boqueria Market', startTime: 6, duration: 2 },
    { location: 'Las Ramblas', startTime: 10, duration: 2 }
  ]
};

// Get who's at the same location at a given time
function getCompanionsAtLocation(person: string, location: string, time: number): string[] {
  const companions: string[] = [];

  Object.entries(journeyData).forEach(([traveler, activities]) => {
    const activity = activities.find(a =>
      a.location === location &&
      time >= a.startTime &&
      time < a.startTime + a.duration
    );
    if (activity && traveler !== person) {
      companions.push(traveler);
    }
  });

  return companions;
}

// Determine group color based on participants
function getGroupColor(participants: string[]): string {
  const sorted = [...participants].sort().join(',');

  if (sorted === 'Alex,Jordan,Maya,Sam') return COLORS.blue;
  if (sorted === 'Alex,Sam') return COLORS.purple;
  if (sorted === 'Maya') return COLORS.green;
  if (sorted === 'Jordan') return COLORS.red;
  if (sorted === 'Jordan,Maya') return COLORS.orange;

  return COLORS.text;
}

const BranchingVisualizationSimple: React.FC = () => {
  const travelers: Traveler[] = ['Alex', 'Sam', 'Maya', 'Jordan'];
  const [selectedTraveler, setSelectedTraveler] = useState<Traveler>('Alex');

  // Generate visualization based on selected traveler's journey
  const renderVisualization = () => {
    const selectedJourney = journeyData[selectedTraveler];
    const rows: React.ReactNode[] = [];

    selectedJourney.forEach((activity, index) => {
      // Get who's with the selected traveler at this activity
      const companions = getCompanionsAtLocation(selectedTraveler, activity.location, activity.startTime);
      const group = [selectedTraveler, ...companions];
      const groupColor = getGroupColor(group);

      // Check what others are doing at this time (for parallel activities)
      const parallelActivities: { traveler: string; location: string }[] = [];
      Object.entries(journeyData).forEach(([traveler, activities]) => {
        if (!group.includes(traveler)) {
          const otherActivity = activities.find(a =>
            activity.startTime >= a.startTime &&
            activity.startTime < a.startTime + a.duration
          );
          if (otherActivity && otherActivity.location !== activity.location) {
            parallelActivities.push({ traveler, location: otherActivity.location });
          }
        }
      });

      // Determine what to show in each column
      let column1Content = null;
      let column2Content = null;

      // Group parallel activities by location
      const parallelByLocation: { [key: string]: string[] } = {};
      parallelActivities.forEach(({ traveler, location }) => {
        if (!parallelByLocation[location]) {
          parallelByLocation[location] = [];
        }
        parallelByLocation[location].push(traveler);
      });

      const parallelLocations = Object.entries(parallelByLocation);
      if (parallelLocations.length > 0) {
        const [loc1, travelers1] = parallelLocations[0];
        column1Content = {
          location: loc1,
          travelers: travelers1,
          color: getGroupColor(travelers1)
        };
      }
      if (parallelLocations.length > 1) {
        const [loc2, travelers2] = parallelLocations[1];
        column2Content = {
          location: loc2,
          travelers: travelers2,
          color: getGroupColor(travelers2)
        };
      }

      rows.push(
        <View key={index} style={styles.row}>
          <View style={styles.graphSection}>
            {/* Column 0: Selected traveler's path */}
            <View style={styles.cell}>
              <Svg width={150} height={150} viewBox="0 0 400 400">
                <Line x1={200} y1={0} x2={200} y2={400} stroke={groupColor} strokeWidth={6} />
                <Circle cx={200} cy={200} r={30} fill={groupColor} stroke={COLORS.background} strokeWidth={6} />
              </Svg>
            </View>

            {/* Column 1: First parallel activity */}
            <View style={styles.cell}>
              {column1Content && (
                <Svg width={150} height={150} viewBox="0 0 400 400">
                  <Line x1={200} y1={0} x2={200} y2={400} stroke={column1Content.color} strokeWidth={6} />
                  <Circle cx={200} cy={200} r={30} fill={column1Content.color} stroke={COLORS.background} strokeWidth={6} />
                </Svg>
              )}
            </View>

            {/* Column 2: Second parallel activity */}
            <View style={styles.cell}>
              {column2Content && (
                <Svg width={150} height={150} viewBox="0 0 400 400">
                  <Line x1={200} y1={0} x2={200} y2={400} stroke={column2Content.color} strokeWidth={6} />
                  <Circle cx={200} cy={200} r={30} fill={column2Content.color} stroke={COLORS.background} strokeWidth={6} />
                </Svg>
              )}
            </View>
          </View>

          <View style={styles.descriptionSection}>
            <Text style={[styles.groupText, { color: groupColor }]}>
              {group.join(' & ')}:
            </Text>
            <Text style={styles.activityText}>{activity.location}</Text>

            {/* Show parallel activities */}
            {column1Content && (
              <Text style={[styles.parallelText, { color: column1Content.color }]}>
                {column1Content.travelers.join(' & ')}: {column1Content.location}
              </Text>
            )}
            {column2Content && (
              <Text style={[styles.parallelText, { color: column2Content.color }]}>
                {column2Content.travelers.join(' & ')}: {column2Content.location}
              </Text>
            )}
          </View>
        </View>
      );
    });

    return rows;
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Barcelona Trip - Day 1</Text>

      {/* Legend Section */}
      <View style={styles.legendContainer}>
        <View style={styles.legendSection}>
          <Text style={styles.legendTitle}>Travelers</Text>
          <View style={styles.legendItems}>
            {travelers.map((traveler) => (
              <TouchableOpacity
                key={traveler}
                style={[
                  styles.travelerItem,
                  selectedTraveler === traveler && styles.selectedTravelerItem,
                ]}
                onPress={() => setSelectedTraveler(traveler)}
              >
                <Text
                  style={[
                    styles.travelerName,
                    selectedTraveler === traveler && styles.selectedTravelerName,
                  ]}
                >
                  {traveler}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.perspectiveNote}>
        Viewing {selectedTraveler}'s journey
      </Text>

      {renderVisualization()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 30,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  graphSection: {
    flexDirection: 'row',
    marginRight: 20,
  },
  cell: {
    width: 150,
    height: 150,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    marginRight: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  descriptionSection: {
    flex: 1,
    justifyContent: 'center',
  },
  groupText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  activityText: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 4,
  },
  parallelText: {
    fontSize: 11,
    marginTop: 2,
    fontStyle: 'italic',
  },
  legendContainer: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  legendSection: {
    marginBottom: 16,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  legendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  travelerItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#21262d',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedTravelerItem: {
    backgroundColor: '#1f6feb',
    borderColor: '#58a6ff',
  },
  travelerName: {
    fontSize: 13,
    color: COLORS.text,
  },
  selectedTravelerName: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  perspectiveNote: {
    color: '#6B7280',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 20,
    textAlign: 'center',
  },
});

export default BranchingVisualizationSimple;