import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Svg, { Line, Circle, Path } from 'react-native-svg';

const COLORS = {
  blue: '#58a6ff',   // Together
  green: '#3fb950',  // Alice alone
  red: '#f85149',    // Bob alone
  background: '#161b22',
  border: '#30363d',
  text: '#c9d1d9',
};

type User = 'Alice' | 'Bob';

interface Activity {
  id: number;
  location: string;
  participants: User[];
  startTime: number;
  duration: number;
}

interface BranchingVisualizationFromActivitiesProps {
  activities: Activity[];
}

const BranchingVisualizationFromActivities: React.FC<BranchingVisualizationFromActivitiesProps> = ({ activities }) => {
  // Get unique time slots
  const timeSlots = [...new Set(activities.map(a => a.startTime))].sort((a, b) => a - b);

  // For each time slot, get the activities
  const getActivitiesAtTime = (time: number) => {
    return activities.filter(a => a.startTime === time);
  };

  // Render a single time slot
  const renderTimeSlot = (time: number, index: number) => {
    const timeActivities = getActivitiesAtTime(time);
    const prevTime = index > 0 ? timeSlots[index - 1] : null;
    const nextTime = index < timeSlots.length - 1 ? timeSlots[index + 1] : null;

    // Check the state at this time
    const hasAlice = timeActivities.some(a => a.participants.includes('Alice'));
    const hasBob = timeActivities.some(a => a.participants.includes('Bob'));
    const together = timeActivities.some(a =>
      a.participants.includes('Alice') && a.participants.includes('Bob')
    );

    // Check previous and next states for transitions
    let prevTogether = false;
    let nextTogether = false;

    if (prevTime !== null) {
      const prevActivities = getActivitiesAtTime(prevTime);
      prevTogether = prevActivities.some(a =>
        a.participants.includes('Alice') && a.participants.includes('Bob')
      );
    }

    if (nextTime !== null) {
      const nextActivities = getActivitiesAtTime(nextTime);
      nextTogether = nextActivities.some(a =>
        a.participants.includes('Alice') && a.participants.includes('Bob')
      );
    }

    // Determine if this is a split or merge point
    const isSplit = together && !nextTogether && nextTime !== null;
    const isMerge = !prevTogether && together && prevTime !== null;

    // Render the visualization
    const renderVisualization = () => {
      if (together) {
        if (isSplit) {
          // Splitting point
          return (
            <View style={styles.cell}>
              <Svg width={200} height={150} viewBox="0 0 400 400">
                <Line x1={200} y1={0} x2={200} y2={200} stroke={COLORS.blue} strokeWidth={6} />
                <Line x1={200} y1={200} x2={100} y2={400} stroke={COLORS.green} strokeWidth={6} />
                <Line x1={200} y1={200} x2={300} y2={400} stroke={COLORS.red} strokeWidth={6} />
                <Circle cx={200} cy={200} r={30} fill={COLORS.blue} stroke={COLORS.background} strokeWidth={6} />
              </Svg>
            </View>
          );
        } else if (isMerge) {
          // Merging point
          return (
            <View style={styles.cell}>
              <Svg width={200} height={150} viewBox="0 0 400 400">
                <Line x1={100} y1={0} x2={200} y2={200} stroke={COLORS.green} strokeWidth={6} />
                <Line x1={300} y1={0} x2={200} y2={200} stroke={COLORS.red} strokeWidth={6} />
                <Line x1={200} y1={200} x2={200} y2={400} stroke={COLORS.blue} strokeWidth={6} />
                <Circle cx={200} cy={200} r={30} fill={COLORS.blue} stroke={COLORS.background} strokeWidth={6} />
              </Svg>
            </View>
          );
        } else {
          // Regular together
          return (
            <View style={styles.cell}>
              <Svg width={200} height={150} viewBox="0 0 400 400">
                <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.blue} strokeWidth={6} />
                <Circle cx={200} cy={200} r={30} fill={COLORS.blue} stroke={COLORS.background} strokeWidth={6} />
              </Svg>
            </View>
          );
        }
      } else {
        // Separated - show two parallel lines
        return (
          <View style={styles.cell}>
            <Svg width={200} height={150} viewBox="0 0 400 400">
              <Line x1={100} y1={0} x2={100} y2={400} stroke={COLORS.green} strokeWidth={6} />
              <Line x1={300} y1={0} x2={300} y2={400} stroke={COLORS.red} strokeWidth={6} />
              {hasAlice && (
                <Circle cx={100} cy={200} r={30} fill={COLORS.green} stroke={COLORS.background} strokeWidth={6} />
              )}
              {hasBob && (
                <Circle cx={300} cy={200} r={30} fill={COLORS.red} stroke={COLORS.background} strokeWidth={6} />
              )}
            </Svg>
          </View>
        );
      }
    };

    // Build descriptions
    const descriptions = timeActivities.map(activity => {
      const color = activity.participants.length === 2 ? COLORS.blue :
                   activity.participants.includes('Alice') ? COLORS.green : COLORS.red;
      return {
        participants: activity.participants,
        location: activity.location,
        color
      };
    });

    return (
      <View key={time} style={styles.row}>
        <View style={styles.graphSection}>
          {renderVisualization()}
        </View>
        <View style={styles.descriptionSection}>
          {descriptions.map((desc, idx) => (
            <View key={idx} style={{ marginBottom: idx < descriptions.length - 1 ? 8 : 0 }}>
              <Text style={[styles.groupText, { color: desc.color }]}>
                {desc.participants.join(' & ')}:
              </Text>
              <Text style={styles.activityText}>{desc.location}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Journey Visualization</Text>

      <View style={styles.legendContainer}>
        <Text style={styles.legendTitle}>Legend</Text>
        <View style={styles.legendItems}>
          <View style={styles.groupItem}>
            <View style={[styles.colorDot, { backgroundColor: COLORS.blue }]} />
            <Text style={styles.groupName}>Together</Text>
          </View>
          <View style={styles.groupItem}>
            <View style={[styles.colorDot, { backgroundColor: COLORS.green }]} />
            <Text style={styles.groupName}>Alice</Text>
          </View>
          <View style={styles.groupItem}>
            <View style={[styles.colorDot, { backgroundColor: COLORS.red }]} />
            <Text style={styles.groupName}>Bob</Text>
          </View>
        </View>
      </View>

      {/* Render each time slot */}
      {timeSlots.map((time, index) => renderTimeSlot(time, index))}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  graphSection: {
    marginRight: 20,
  },
  cell: {
    width: 200,
    height: 150,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
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
    marginBottom: 2,
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
  legendTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  legendItems: {
    flexDirection: 'row',
    gap: 16,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  groupName: {
    fontSize: 12,
    color: COLORS.text,
  },
});

export default BranchingVisualizationFromActivities;