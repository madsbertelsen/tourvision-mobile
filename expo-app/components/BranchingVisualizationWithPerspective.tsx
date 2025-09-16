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
  selectedBg: '#21262d',
};

type User = 'Alex' | 'Sam' | 'Maya' | 'Jordan';

interface Activity {
  location: string;
  groups: {
    [key: string]: User[];
  };
}

// Define the journey for each user perspective
const journeys: { [key in User]: Activity[] } = {
  Alex: [
    { location: 'Hotel Casa Fuster', groups: { blue: ['Alex', 'Sam', 'Maya', 'Jordan'] } },
    { location: 'Gothic Quarter', groups: { purple: ['Alex', 'Sam'], green: ['Maya'], red: ['Jordan'] } },
    { location: 'Gothic Quarter', groups: { purple: ['Alex', 'Sam'], green: ['Maya'], red: ['Jordan'] } },
    { location: 'Gothic Quarter', groups: { purple: ['Alex', 'Sam'], green: ['Maya'], red: ['Jordan'] } },
    { location: 'Gothic Quarter', groups: { purple: ['Alex', 'Sam'], orange: ['Maya', 'Jordan'] } },
    { location: 'Casa Batlló', groups: { purple: ['Alex', 'Sam'], orange: ['Maya', 'Jordan'] } },
    { location: 'Las Ramblas', groups: { blue: ['Alex', 'Sam', 'Maya', 'Jordan'] } },
  ],
  Sam: [
    { location: 'Hotel Casa Fuster', groups: { blue: ['Alex', 'Sam', 'Maya', 'Jordan'] } },
    { location: 'Gothic Quarter', groups: { purple: ['Alex', 'Sam'], green: ['Maya'], red: ['Jordan'] } },
    { location: 'Gothic Quarter', groups: { purple: ['Alex', 'Sam'], green: ['Maya'], red: ['Jordan'] } },
    { location: 'Gothic Quarter', groups: { purple: ['Alex', 'Sam'], green: ['Maya'], red: ['Jordan'] } },
    { location: 'Gothic Quarter', groups: { purple: ['Alex', 'Sam'], orange: ['Maya', 'Jordan'] } },
    { location: 'Casa Batlló', groups: { purple: ['Alex', 'Sam'], orange: ['Maya', 'Jordan'] } },
    { location: 'Las Ramblas', groups: { blue: ['Alex', 'Sam', 'Maya', 'Jordan'] } },
  ],
  Maya: [
    { location: 'Hotel Casa Fuster', groups: { blue: ['Alex', 'Sam', 'Maya', 'Jordan'] } },
    { location: 'Barceloneta Beach', groups: { green: ['Maya'], purple: ['Alex', 'Sam'], red: ['Jordan'] } },
    { location: 'Barceloneta Beach', groups: { green: ['Maya'], purple: ['Alex', 'Sam'], red: ['Jordan'] } },
    { location: 'Barceloneta Beach', groups: { green: ['Maya'], purple: ['Alex', 'Sam'], red: ['Jordan'] } },
    { location: 'Boqueria Market', groups: { orange: ['Maya', 'Jordan'], purple: ['Alex', 'Sam'] } },
    { location: 'Boqueria Market', groups: { orange: ['Maya', 'Jordan'], purple: ['Alex', 'Sam'] } },
    { location: 'Las Ramblas', groups: { blue: ['Alex', 'Sam', 'Maya', 'Jordan'] } },
  ],
  Jordan: [
    { location: 'Hotel Casa Fuster', groups: { blue: ['Alex', 'Sam', 'Maya', 'Jordan'] } },
    { location: 'Park Güell', groups: { red: ['Jordan'], purple: ['Alex', 'Sam'], green: ['Maya'] } },
    { location: 'Park Güell', groups: { red: ['Jordan'], purple: ['Alex', 'Sam'], green: ['Maya'] } },
    { location: 'Park Güell', groups: { red: ['Jordan'], purple: ['Alex', 'Sam'], green: ['Maya'] } },
    { location: 'Boqueria Market', groups: { orange: ['Maya', 'Jordan'], purple: ['Alex', 'Sam'] } },
    { location: 'Boqueria Market', groups: { orange: ['Maya', 'Jordan'], purple: ['Alex', 'Sam'] } },
    { location: 'Las Ramblas', groups: { blue: ['Alex', 'Sam', 'Maya', 'Jordan'] } },
  ],
};

const BranchingVisualizationWithPerspective: React.FC = () => {
  const [selectedUser, setSelectedUser] = useState<User>('Alex');
  const users: User[] = ['Alex', 'Sam', 'Maya', 'Jordan'];

  const getUserColor = (user: User, activity: Activity): string => {
    // Find which group contains this user
    for (const [color, members] of Object.entries(activity.groups)) {
      if (members.includes(user)) {
        return COLORS[color as keyof typeof COLORS] || COLORS.text;
      }
    }
    return COLORS.text;
  };

  const renderUserJourney = () => {
    const journey = journeys[selectedUser];

    return journey.map((activity, index) => {
      const userColor = getUserColor(selectedUser, activity);
      const otherActivities: { user: User; location: string; color: string }[] = [];

      // Find what other users are doing at this time
      users.forEach(user => {
        if (user !== selectedUser) {
          const otherJourney = journeys[user][index];
          if (otherJourney.location !== activity.location) {
            otherActivities.push({
              user,
              location: otherJourney.location,
              color: getUserColor(user, otherJourney),
            });
          }
        }
      });

      return (
        <View key={index} style={styles.row}>
          {/* Main column - selected user's journey */}
          <View style={styles.mainColumn}>
            <View style={styles.cell}>
              <Svg width={120} height={80} viewBox="0 0 400 400">
                {/* User's line */}
                <Line x1={200} y1={0} x2={200} y2={400} stroke={userColor} strokeWidth={3} />
                {/* Activity dot */}
                <Circle cx={200} cy={200} r={8} fill={userColor} stroke={COLORS.background} strokeWidth={2} />
              </Svg>
            </View>
            <View style={styles.activityInfo}>
              <Text style={[styles.locationText, { color: userColor }]}>
                {activity.location}
              </Text>
              <Text style={styles.groupText}>
                {Object.entries(activity.groups)
                  .filter(([_, members]) => members.includes(selectedUser))
                  .map(([_, members]) => members.join(', '))[0]}
              </Text>
            </View>
          </View>

          {/* Other columns - parallel activities */}
          <View style={styles.othersSection}>
            {otherActivities.map((other, idx) => (
              <View key={idx} style={styles.otherActivity}>
                <Text style={[styles.otherUserText, { color: other.color }]}>
                  {other.user}:
                </Text>
                <Text style={styles.otherLocationText}>
                  {other.location}
                </Text>
              </View>
            ))}
          </View>
        </View>
      );
    });
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Barcelona Trip - Day 1</Text>

      {/* User selector */}
      <View style={styles.userSelector}>
        <Text style={styles.selectorLabel}>Viewing as:</Text>
        <View style={styles.userButtons}>
          {users.map(user => (
            <TouchableOpacity
              key={user}
              style={[
                styles.userButton,
                selectedUser === user && styles.selectedButton,
              ]}
              onPress={() => setSelectedUser(user)}
            >
              <Text
                style={[
                  styles.userButtonText,
                  selectedUser === user && styles.selectedButtonText,
                ]}
              >
                {user}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={styles.perspectiveNote}>
        The left column shows {selectedUser}'s complete journey
      </Text>

      {/* Legend Section */}
      <View style={styles.legendContainer}>
        <View style={styles.legendSection}>
          <Text style={styles.legendTitle}>Group Colors</Text>
          <View style={styles.legendItems}>
            <View style={styles.groupItem}>
              <View style={[styles.colorDot, { backgroundColor: COLORS.blue }]} />
              <Text style={styles.groupName}>Blue:</Text>
              <Text style={styles.groupMembers}>All together</Text>
            </View>
            <View style={styles.groupItem}>
              <View style={[styles.colorDot, { backgroundColor: COLORS.purple }]} />
              <Text style={styles.groupName}>Purple:</Text>
              <Text style={styles.groupMembers}>Alex & Sam</Text>
            </View>
            <View style={styles.groupItem}>
              <View style={[styles.colorDot, { backgroundColor: COLORS.green }]} />
              <Text style={styles.groupName}>Green:</Text>
              <Text style={styles.groupMembers}>Maya alone</Text>
            </View>
            <View style={styles.groupItem}>
              <View style={[styles.colorDot, { backgroundColor: COLORS.red }]} />
              <Text style={styles.groupName}>Red:</Text>
              <Text style={styles.groupMembers}>Jordan alone</Text>
            </View>
            <View style={styles.groupItem}>
              <View style={[styles.colorDot, { backgroundColor: COLORS.orange }]} />
              <Text style={styles.groupName}>Orange:</Text>
              <Text style={styles.groupMembers}>Maya & Jordan</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.visualization}>
        {renderUserJourney()}
      </View>
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
    marginBottom: 20,
    textAlign: 'center',
  },
  userSelector: {
    marginBottom: 20,
  },
  selectorLabel: {
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 10,
  },
  userButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  userButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  selectedButton: {
    backgroundColor: COLORS.selectedBg,
    borderWidth: 2,
  },
  userButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectedButtonText: {
    fontWeight: 'bold',
  },
  perspectiveNote: {
    color: '#6B7280',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 20,
    textAlign: 'center',
  },
  visualization: {
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 15,
    minHeight: 80,
  },
  mainColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '50%',
  },
  cell: {
    width: 120,
    height: 80,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  activityInfo: {
    flex: 1,
  },
  locationText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  groupText: {
    fontSize: 11,
    color: '#6B7280',
  },
  othersSection: {
    flex: 1,
    paddingLeft: 20,
    justifyContent: 'center',
  },
  otherActivity: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  otherUserText: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 5,
  },
  otherLocationText: {
    fontSize: 12,
    color: '#6B7280',
  },
  legendContainer: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  legendSection: {
    marginBottom: 8,
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
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 4,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  groupName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: 4,
  },
  groupMembers: {
    fontSize: 12,
    color: '#8b949e',
  },
});

export default BranchingVisualizationWithPerspective;