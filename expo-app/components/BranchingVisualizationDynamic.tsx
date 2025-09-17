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

interface Journey {
  [key: string]: Activity[];
}

// Define the journey data with time
const journeyData: Journey = {
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

interface ActivityRow {
  location: string;
  startTime: number;
  participants: string[];
}

// Get what a specific user is doing at a given time
function getUserActivityAtTime(user: string, time: number, journeys: Journey): Activity | null {
  const activities = journeys[user];
  if (!activities) return null;

  return activities.find(activity =>
    time >= activity.startTime && time < activity.startTime + activity.duration
  ) || null;
}

// Generate rows from journey data for a specific user's perspective
function generateActivityRows(selectedUser: string, journeys: Journey): ActivityRow[] {
  const rows: ActivityRow[] = [];
  const processedActivities = new Set<string>();

  // Get all unique times when activities start
  const timePoints = new Set<number>();
  Object.values(journeys).forEach(activities => {
    activities.forEach(activity => {
      timePoints.add(activity.startTime);
    });
  });

  const sortedTimes = Array.from(timePoints).sort((a, b) => a - b);

  // For each time point, create rows for activities starting at that time
  sortedTimes.forEach(time => {
    // First, check if selected user starts a new activity at this time
    const selectedUserActivity = journeys[selectedUser]?.find(a => a.startTime === time);

    if (selectedUserActivity) {
      // Find who else is doing this activity
      const participants: string[] = [];
      Object.entries(journeys).forEach(([person, activities]) => {
        const activity = activities.find(a =>
          a.startTime === time && a.location === selectedUserActivity.location
        );
        if (activity) {
          participants.push(person);
        }
      });

      const activityKey = `${time}-${selectedUserActivity.location}`;
      if (!processedActivities.has(activityKey)) {
        rows.push({
          location: selectedUserActivity.location,
          startTime: time,
          participants: participants
        });
        processedActivities.add(activityKey);
      }
    }

    // Then add other activities starting at this time (that selected user is NOT part of)
    Object.entries(journeys).forEach(([person, activities]) => {
      activities.forEach(activity => {
        if (activity.startTime === time) {
          const activityKey = `${time}-${activity.location}`;
          const isSelectedUserThere = selectedUserActivity?.location === activity.location;

          if (!processedActivities.has(activityKey) && !isSelectedUserThere) {
            // Find all participants for this activity
            const participants: string[] = [];
            Object.entries(journeys).forEach(([p, acts]) => {
              const act = acts.find(a =>
                a.startTime === time && a.location === activity.location
              );
              if (act) {
                participants.push(p);
              }
            });

            rows.push({
              location: activity.location,
              startTime: time,
              participants: participants
            });
            processedActivities.add(activityKey);
          }
        }
      });
    });
  });

  return rows;
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

// Track which column each group is in for continuity
interface ColumnState {
  [location: string]: number;
}

// Get column layout for visualization
function getVisualizationLayout(selectedUser: string, rows: ActivityRow[], journeys: Journey) {
  const layout: { columns: (ActivityRow | null)[][]; columnStates: ColumnState[] } = {
    columns: [],
    columnStates: []
  };

  let currentColumnState: ColumnState = {};

  rows.forEach((row, rowIndex) => {
    const rowColumns: (ActivityRow | null)[] = [null, null, null];

    // Check if selected user is in this activity
    if (row.participants.includes(selectedUser)) {
      // Selected user's activity always goes in column 0
      rowColumns[0] = row;
      currentColumnState[row.location] = 0;
    } else {
      // This is a parallel activity - find an appropriate column
      // First, check what the selected user is doing at this time
      const selectedUserActivity = getUserActivityAtTime(selectedUser, row.startTime, journeys);

      if (selectedUserActivity) {
        // Put selected user's ongoing activity in column 0
        const selectedUserRow: ActivityRow = {
          location: selectedUserActivity.location,
          startTime: selectedUserActivity.startTime,
          participants: [] // Will be filled based on who's there
        };

        // Find who's with selected user
        Object.keys(journeys).forEach(person => {
          const activity = getUserActivityAtTime(person, row.startTime, journeys);
          if (activity?.location === selectedUserActivity.location) {
            selectedUserRow.participants.push(person);
          }
        });

        rowColumns[0] = selectedUserRow;

        // Put the parallel activity in column 1 or 2
        const prevColumn = currentColumnState[row.location] || 1;
        rowColumns[prevColumn] = row;
        currentColumnState[row.location] = prevColumn;
      }
    }

    layout.columns.push(rowColumns);
    layout.columnStates.push({ ...currentColumnState });
  });

  return layout;
}

const BranchingVisualizationDynamic: React.FC = () => {
  const travelers: Traveler[] = ['Alex', 'Sam', 'Maya', 'Jordan'];
  const [selectedTraveler, setSelectedTraveler] = useState<Traveler>('Alex');

  const activityRows = generateActivityRows(selectedTraveler, journeyData);
  const layout = getVisualizationLayout(selectedTraveler, activityRows, journeyData);

  // Render a cell with appropriate SVG
  const renderCell = (
    rowIndex: number,
    colIndex: number,
    activity: ActivityRow | null,
    isActivityRow: boolean
  ) => {
    if (!activity) {
      return <View style={styles.cell} key={`${rowIndex}-${colIndex}`} />;
    }

    const color = getGroupColor(activity.participants);

    // Simple vertical line for now
    return (
      <View style={styles.cell} key={`${rowIndex}-${colIndex}`}>
        <Svg width={150} height={150} viewBox="0 0 400 400">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={color} strokeWidth={6} />
          {isActivityRow && (
            <Circle cx={200} cy={200} r={30} fill={color} stroke={COLORS.background} strokeWidth={6} />
          )}
        </Svg>
      </View>
    );
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

      {/* Render activity rows */}
      {activityRows.map((row, rowIndex) => {
        const rowColumns = layout.columns[rowIndex] || [null, null, null];
        const mainActivity = rowColumns[0] || row; // Use column 0 or fallback to row

        return (
          <View key={rowIndex} style={styles.row}>
            <View style={styles.graphSection}>
              {[0, 1, 2].map(colIndex => {
                const columnActivity = rowColumns[colIndex];
                // Show dot if this column's activity matches the current row
                const showDot = columnActivity &&
                  columnActivity.location === row.location &&
                  columnActivity.startTime === row.startTime;
                return renderCell(rowIndex, colIndex, columnActivity, showDot);
              })}
            </View>

            <View style={styles.descriptionSection}>
              <Text style={[styles.groupText, { color: getGroupColor(row.participants) }]}>
                {row.participants.join(' & ')}:
              </Text>
              <Text style={styles.activityText}>{row.location}</Text>
            </View>
          </View>
        );
      })}
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

export default BranchingVisualizationDynamic;