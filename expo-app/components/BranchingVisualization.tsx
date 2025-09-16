import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
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

interface RowData {
  id: number;
  activity: string;
  group: string;
  groupColor: string;
  cells: React.ReactNode[];
}

const BranchingVisualization: React.FC = () => {
  // Define the travelers
  const travelers = ['Alex', 'Sam', 'Maya', 'Jordan'];

  // Define group compositions
  const groupCompositions = [
    { color: COLORS.blue, name: 'Blue', members: 'All together (Alex, Sam, Maya, Jordan)' },
    { color: COLORS.purple, name: 'Purple', members: 'Alex & Sam' },
    { color: COLORS.green, name: 'Green', members: 'Maya alone' },
    { color: COLORS.red, name: 'Red', members: 'Jordan alone' },
    { color: COLORS.orange, name: 'Orange', members: 'Maya & Jordan' },
  ];

  const rows: RowData[] = [
    {
      id: 1,
      activity: 'Hotel Casa Fuster',
      group: 'All together',
      groupColor: COLORS.blue,
      cells: [
        // Cell 1: Branch point
        <Svg width={150} height={150} viewBox="0 0 400 400" key="1-1">
          {/* Blue line comes in and stops at branch point */}
          <Line x1={200} y1={0} x2={200} y2={200} stroke={COLORS.blue} strokeWidth={6} />
          {/* Purple line continues down */}
          <Line x1={200} y1={200} x2={200} y2={400} stroke={COLORS.purple} strokeWidth={6} />
          {/* Green branch */}
          <Line x1={200} y1={200} x2={400} y2={200} stroke={COLORS.green} strokeWidth={6} />
          {/* Red branch */}
          <Line x1={200} y1={200} x2={400} y2={200} stroke={COLORS.red} strokeWidth={6} />
          {/* Branch point dot */}
          <Circle cx={200} cy={200} r={30} fill={COLORS.blue} stroke={COLORS.background} strokeWidth={6} />
        </Svg>,
        // Cell 2: Green curves down
        <Svg width={150} height={150} viewBox="0 0 400 400" key="1-2">
          <Path d="M 0 200 L 150 200 Q 200 200, 200 250 L 200 400"
                stroke={COLORS.green} strokeWidth={6} fill="none" />
          <Line x1={0} y1={200} x2={400} y2={200} stroke={COLORS.red} strokeWidth={6} />
        </Svg>,
        // Cell 3: Red curves down
        <Svg width={150} height={150} viewBox="0 0 400 400" key="1-3">
          <Path d="M 0 200 L 150 200 Q 200 200, 200 250 L 200 400"
                stroke={COLORS.red} strokeWidth={6} fill="none" />
        </Svg>,
      ],
    },
    {
      id: 2,
      activity: 'Gothic Quarter',
      group: 'Purple (Alex & Sam)',
      groupColor: COLORS.purple,
      cells: [
        // Cell 1: Purple continues
        <Svg width={150} height={150} viewBox="0 0 400 400" key="2-1">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.purple} strokeWidth={6} />
          <Circle cx={200} cy={200} r={30} fill={COLORS.purple} stroke={COLORS.background} strokeWidth={6} />
        </Svg>,
        // Cell 2: Green continues
        <Svg width={150} height={150} viewBox="0 0 400 400" key="2-2">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.green} strokeWidth={6} />
        </Svg>,
        // Cell 3: Red continues
        <Svg width={150} height={150} viewBox="0 0 400 400" key="2-3">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.red} strokeWidth={6} />
        </Svg>,
      ],
    },
    {
      id: 3,
      activity: 'Barceloneta Beach',
      group: 'Green (Maya),',
      groupColor: COLORS.green,
      cells: [
        // Cell 1: Purple continues
        <Svg width={150} height={150} viewBox="0 0 400 400" key="3-1">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.purple} strokeWidth={6} />
        </Svg>,
        // Cell 2: Green with activity
        <Svg width={150} height={150} viewBox="0 0 400 400" key="3-2">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.green} strokeWidth={6} />
          <Circle cx={200} cy={200} r={30} fill={COLORS.green} stroke={COLORS.background} strokeWidth={6} />
        </Svg>,
        // Cell 3: Red continues
        <Svg width={150} height={150} viewBox="0 0 400 400" key="3-3">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.red} strokeWidth={6} />
        </Svg>,
      ],
    },
    {
      id: 4,
      activity: 'Park Güell',
      group: 'Red (Jordan),',
      groupColor: COLORS.red,
      cells: [
        // Cell 1: Purple continues
        <Svg width={150} height={150} viewBox="0 0 400 400" key="4-1">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.purple} strokeWidth={6} />
        </Svg>,
        // Cell 2: Green continues
        <Svg width={150} height={150} viewBox="0 0 400 400" key="4-2">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.green} strokeWidth={6} />
        </Svg>,
        // Cell 3: Red with activity
        <Svg width={150} height={150} viewBox="0 0 400 400" key="4-3">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.red} strokeWidth={6} />
          <Circle cx={200} cy={200} r={30} fill={COLORS.red} stroke={COLORS.background} strokeWidth={6} />
        </Svg>,
      ],
    },
    {
      id: 5,
      activity: 'Boqueria Market',
      group: 'Orange (Maya & Jordan),',
      groupColor: COLORS.orange,
      cells: [
        // Cell 1: Purple continues
        <Svg width={150} height={150} viewBox="0 0 400 400" key="5-1">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.purple} strokeWidth={6} />
        </Svg>,
        // Cell 2: Green and Red merge into Orange
        <Svg width={150} height={150} viewBox="0 0 400 400" key="5-2">
          <Line x1={200} y1={0} x2={200} y2={200} stroke={COLORS.green} strokeWidth={6} />
          <Line x1={200} y1={200} x2={200} y2={400} stroke={COLORS.orange} strokeWidth={6} />
          <Line x1={400} y1={200} x2={200} y2={200} stroke={COLORS.red} strokeWidth={6} />
          <Circle cx={200} cy={200} r={30} fill={COLORS.orange} stroke={COLORS.background} strokeWidth={6} />
        </Svg>,
        // Cell 3: Red curves to merge
        <Svg width={150} height={150} viewBox="0 0 400 400" key="5-3">
          <Path d="M 200 0 L 200 150 Q 200 200, 150 200 L 0 200"
                stroke={COLORS.red} strokeWidth={6} fill="none" />
        </Svg>,
      ],
    },
    {
      id: 6,
      activity: 'Casa Batlló',
      group: 'Purple (Alex & Sam)',
      groupColor: COLORS.purple,
      cells: [
        // Cell 1: Purple with activity
        <Svg width={150} height={150} viewBox="0 0 400 400" key="6-1">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.purple} strokeWidth={6} />
          <Circle cx={200} cy={200} r={30} fill={COLORS.purple} stroke={COLORS.background} strokeWidth={6} />
        </Svg>,
        // Cell 2: Orange continues
        <Svg width={150} height={150} viewBox="0 0 400 400" key="6-2">
          <Line x1={200} y1={0} x2={200} y2={400} stroke={COLORS.orange} strokeWidth={6} />
        </Svg>,
        // Cell 3: Empty
        <View key="6-3" />,
      ],
    },
    {
      id: 7,
      activity: 'Las Ramblas',
      group: 'All (everyone together)',
      groupColor: COLORS.blue,
      cells: [
        // Cell 1: Purple and Orange merge to reform Blue
        <Svg width={150} height={150} viewBox="0 0 400 400" key="7-1">
          <Line x1={200} y1={0} x2={200} y2={200} stroke={COLORS.purple} strokeWidth={6} />
          <Line x1={200} y1={200} x2={200} y2={400} stroke={COLORS.blue} strokeWidth={6} />
          <Line x1={400} y1={200} x2={200} y2={200} stroke={COLORS.orange} strokeWidth={6} />
          <Circle cx={200} cy={200} r={30} fill={COLORS.blue} stroke={COLORS.background} strokeWidth={6} />
        </Svg>,
        // Cell 2: Orange curves to merge
        <Svg width={150} height={150} viewBox="0 0 400 400" key="7-2">
          <Path d="M 200 0 L 200 150 Q 200 200, 150 200 L 0 200"
                stroke={COLORS.orange} strokeWidth={6} fill="none" />
        </Svg>,
        // Cell 3: Empty
        <View key="7-3" />,
      ],
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Barcelona Trip - Day 1</Text>

      {/* Legend Section */}
      <View style={styles.legendContainer}>
        <View style={styles.legendSection}>
          <Text style={styles.legendTitle}>Travelers</Text>
          <View style={styles.legendItems}>
            {travelers.map((traveler) => (
              <View key={traveler} style={styles.travelerItem}>
                <Text style={styles.travelerName}>{traveler}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.legendSection}>
          <Text style={styles.legendTitle}>Group Colors</Text>
          <View style={styles.legendItems}>
            {groupCompositions.map((group) => (
              <View key={group.name} style={styles.groupItem}>
                <View style={[styles.colorDot, { backgroundColor: group.color }]} />
                <Text style={styles.groupName}>{group.name}:</Text>
                <Text style={styles.groupMembers}>{group.members}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {rows.map((row) => (
        <View key={row.id} style={styles.row}>
          <View style={styles.graphSection}>
            {row.cells.map((cell, index) => (
              <View key={`cell-${row.id}-${index}`} style={styles.cell}>
                {cell}
              </View>
            ))}
          </View>

          <View style={styles.descriptionSection}>
            <Text style={[styles.groupText, { color: row.groupColor }]}>
              {row.group}:
            </Text>
            <Text style={styles.activityText}>{row.activity}</Text>
          </View>
        </View>
      ))}
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
  },
  travelerName: {
    fontSize: 13,
    color: COLORS.text,
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

export default BranchingVisualization;