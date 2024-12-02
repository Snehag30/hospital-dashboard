document.addEventListener('DOMContentLoaded', () => {

    var admission_cnt = 0;
    var discharge_cnt = 0;
    var cnt = 0;
    let notifications = [];
    const MAX_NOTIFICATIONS = 10;
    const shownNotifications = new Set();
    const departmentCounts = new Map(); // Track current counts for each department
    let notificationCount = 0;
    let activeNotifications = new Map();
    const socket = io.connect('http://localhost:5000');
        let admissionData = [];
        let dischargeData = [];
    //    let bedOccupancyData = [];
    let bedOccupancyData = new Map();
        let billingData = [];
        ['cardiology', 'neurology', 'orthopedics', 'pediatrics'].forEach(dept => {
        departmentCounts.set(dept, {
            currentCount: 0,
            admissions: [],
            discharges: []
        });
    });

    // chart theme
    const chartTheme = {
        font: {
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            size: 12,
            color: '#1e293b'
        },
        paper_bgcolor: 'rgba(255,255,255,0)',
        plot_bgcolor: 'rgba(255,255,255,0)',
        colorway: ['#818cf8', '#c084fc', '#fb7185', '#34d399'],
        gridcolor: '#e2e8f0',
        linecolor: '#e2e8f0'
    };


    // Initialize Charts
    const commonChartLayout = {
        ...chartTheme,
        margin: { t: 40, r: 20, l: 50, b: 40 },
        xaxis: {
            showgrid: true,
            gridcolor: chartTheme.gridcolor,
            linecolor: chartTheme.linecolor
        },
        yaxis: {
            showgrid: true,
            gridcolor: chartTheme.gridcolor,
            linecolor: chartTheme.linecolor
        }
    };

    // Initialize Recovery Rate Gauge
    let recoveryRateGauge = {
        type: "indicator",
        mode: "gauge+number",
        value: 0,

        gauge: {
            axis: {
                range: [null, 100],
                tickwidth: 1,
                tickcolor: "#6366f1",
                tickfont: { family: chartTheme.font.family }
            },
            bar: { color: "#6366f1" },
            bgcolor: "white",
            borderwidth: 2,
            bordercolor: "#e2e8f0",
            steps: [
                { range: [0, 30], color: "rgba(251,113,133,0.4)" },
                { range: [30, 70], color: "rgba(250,204,21,0.4)" },
                { range: [70, 100], color: "rgba(52,211,153,0.4)" }
            ],
            threshold: {
                line: { color: "#6366f1", width: 2 },
                thickness: 0.75,
                value: 0
            }
        }
    };

    let admissionsChart = {
        x: [],
        y: [],
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Admissions',
        line: {
            color: '#818cf8',
            width: 3
        },
        marker: {
            size: 8,
            color: '#818cf8'
        }
    };

    let dischargesChart = {
        x: [],
        y: [],
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Discharges',
        line: {
            color: '#34d399',
            width: 3
        },
        marker: {
            size: 8,
            color: '#34d399'
        }
    };

    let bedOccupancyChart = {
        x: [],
        y: [],
        type: 'bar',
        name: 'Bed Occupancy',
        marker: {
            color: '#c084fc'
        }
    };

    let billingChart = {
        x: [],
        y: [],
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Billing Average',
        line: {
            color: '#fb7185',
            width: 3
        },
        marker: {
            size: 8,
            color: '#fb7185'
        }
    };

    let genderChart = {
        values: [],
        labels: ['Male', 'Female', 'Other'],
        type: 'pie',
        name: 'Gender Distribution',
        marker: {
            colors: ['#818cf8', '#c084fc', '#94a3b8']
        },
        textinfo: 'label+percent',
        hole: 0.4
    };

    let ageDistributionChart = {
        values: [],
        labels: ['1-20', '21-40', '41-60', '61-90'],
        type: 'pie',
        name: 'Age Distribution',
        marker: {
            colors: ['#818cf8', '#c084fc', '#fb7185', '#34d399']
        },
        textinfo: 'label+percent',
        hole: 0.4
    };

    // Initialize all charts with themes
    Plotly.newPlot('admissions-chart', [admissionsChart], {
        ...commonChartLayout,
        title: { text: 'Admissions Over Time', font: { size: 20 } }
    });

    Plotly.newPlot('discharges-chart', [dischargesChart], {
        ...commonChartLayout,
        title: { text: 'Discharges Over Time', font: { size: 20 } }
    });

    Plotly.newPlot('bed-occupancy-chart', [bedOccupancyChart], {
        ...commonChartLayout,
        title: { text: 'Bed Occupancy by Department', font: { size: 20 } },
        width: 727,
        height: 500
    });

    Plotly.newPlot('billing-chart', [billingChart], {
        ...commonChartLayout,
        title: { text: 'Running Average of Bills', font: { size: 20 } }
    });

    Plotly.newPlot('gender-chart', [genderChart], {
        ...commonChartLayout,
        title: { text: 'Gender Distribution', font: { size: 20 } },
        width: 400,
        height: 320
    });

    Plotly.newPlot('age-distribution-chart', [ageDistributionChart], {
        ...commonChartLayout,
        title: { text: 'Age Distribution', font: { size: 20 } },
        width: 400,
        height: 500
    });

    Plotly.newPlot('recovery-rate-chart', [recoveryRateGauge], {
        width: 440,
        height: 320,
        margin: { t: 25, r: 25, l: 24, b: 25 },
        paper_bgcolor: 'rgba(255,255,255,0)'
    });

    // Function to fetch historical data
           async function fetchHistoricalData() {
            try {
                const response = await fetch(`http://localhost:5000/historical_data`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();

                return data;
            } catch (error) {
                console.error("There was a problem fetching the historical data:", error);
                // Optionally, display an error message to the user
                document.getElementById('error-message').textContent = "Failed to load historical data. Please check your connection and try again.";
                throw error; // Re-throw the error if you want calling code to handle it
            }
        }

    // Function to process historical data
//function processHistoricalData(data) {
//    // Reset all data structures
//    admissionData = [];
//    dischargeData = [];
//    bedOccupancyData.clear();
//    billingData = [];
//
//    // Reset department counts
//    ['cardiology', 'neurology', 'orthopedics', 'pediatrics'].forEach(dept => {
//        departmentCounts.set(dept, {
//            currentCount: 0,
//            admissions: [],
//            discharges: []
//        });
//    });
//
//    // Process each event
//    data.forEach(event => {
//        const { event_type, timestamp } = event;
//        console.log("---------------------------------------------")
//        console.log(event)
//        if (event_type === 'admission') {
//            // Ensure department exists in departmentCounts
////            if (!departmentCounts.has(event.department.toLowerCase())) {
////                console.warn(`Unknown department: ${event.department}`);
////                return;
////            }
//
//            const deptData = departmentCounts.get(event.department);
//            deptData.currentCount++;
//            deptData.admissions.push({
//                timestamp,
//                count: deptData.currentCount,
//                department: event.department,
//                patient_id: event.patient_id,
//                ...event
//            });
//
//            // Add to bed occupancy
//            bedOccupancyData.set(event.patient_id, { ...event, timestamp });
//            admissionData.push({ ...event, timestamp, count: deptData.currentCount });
//        }
//        else if (event_type === 'discharge') {
//            // Ensure department exists in departmentCounts
////            if (!departmentCounts.has(event.department.toLowerCase())) {
////                console.warn(`Unknown department: ${event.department}`);
////                return;
////            }
//
//            const deptData = departmentCounts.get(event.department);
//            deptData.currentCount = Math.max(0, deptData.currentCount - 1);
//            deptData.discharges.push({
//                timestamp,
//                count: deptData.currentCount,
//                department: event.department,
//                patient_id: event.patient_id,
//                ...event
//            });
//
//            // Remove from bed occupancy
//            bedOccupancyData.delete(event.patient_id);
//            dischargeData.push({ ...event, timestamp, count: deptData.currentCount });
//        }
//        else if (event_type === 'billing') {
//            billingData.push({ ...event.details, timestamp });
//        }
//    });
//
//    // Log processed data for debugging
//    console.log("Historical data processing complete:");
//    console.log("Admissions:", admissionData);
//    console.log("Discharges:", dischargeData);
//    console.log("Bed Occupancy:", bedOccupancyData);
//    console.log("Billing:", billingData);
//    console.log("Department Counts:", departmentCounts);
//
//    return {
//        admissionData,
//        dischargeData,
//        bedOccupancyData,
//        billingData,
//        departmentCounts
//    };
//}

function processHistoricalData(data) {
    // Reset all data structures
    admissionData = [];
    dischargeData = [];
    bedOccupancyData.clear();
    billingData = [];

    // Reset department counts with proper initialization
    const validDepartments = ['cardiology', 'neurology', 'orthopedics', 'pediatrics'];
    validDepartments.forEach(dept => {
        departmentCounts.set(dept, {
            currentCount: 0,
            admissions: [],
            discharges: []
        });
    });

    // Process each event
    data.forEach(event => {
        const { event_type, timestamp, details } = event;


        if (event_type === 'admission' || event_type === 'discharge') {
            // Normalize department name to lowercase for consistency
            const department = details.department;

            // Check if department exists, if not, initialize it
            if (!departmentCounts.has(department)) {
                console.warn(`Initializing new department: ${department}`);
                departmentCounts.set(department, {
                    currentCount: 0,
                    admissions: [],
                    discharges: []
                });
            }

            const deptData = departmentCounts.get(department);

            if (event_type === 'admission') {
                deptData.currentCount++;
                deptData.admissions.push({
                    timestamp,
                    count: deptData.currentCount,
                    department: event.department,
                    patient_id: event.patient_id,
                    ...details
                });

                bedOccupancyData.set(details.patient_id, { ...details, timestamp });
                admissionData.push({ ...details, timestamp, count: deptData.currentCount });
            } else { // discharge
                deptData.currentCount = Math.max(0, deptData.currentCount - 1);
                deptData.discharges.push({
                    timestamp,
                    count: deptData.currentCount,
                    department: event.department,
                    patient_id: event.patient_id,
                    ...details
                });

                bedOccupancyData.delete(details.patient_id);
                dischargeData.push({ ...details, timestamp, count: deptData.currentCount });
            }
        } else if (event_type === 'billing') {
            billingData.push({ ...details, timestamp });
        }
    });

    // Log processed data for debugging
    console.log("Historical data processing complete:");
    console.log("Admissions:", admissionData);
    console.log("Discharges:", dischargeData);
    console.log("Bed Occupancy:", bedOccupancyData);
    console.log("Billing:", billingData);
    console.log("Department Counts:", departmentCounts);

    return {
        admissionData,
        dischargeData,
        bedOccupancyData,
        billingData,
        departmentCounts
    };
}

// Update the initialization function to properly handle the processed data
async function initializeHistoricalData() {
    try {
        const historical_data = await fetchHistoricalData();
        if (!Array.isArray(historical_data)) {
            throw new Error('Historical data is not in the expected format');
        }
        console.log("historical_data, ", historical_data)
        const processedData = processHistoricalData(historical_data);
        return processedData;
    } catch (error) {
        console.error('Failed to initialize historical data:', error);
        throw error;
    }
}

// Usage
initializeHistoricalData()
    .then(processedData => {
        console.log('Successfully processed historical data:', processedData);
        // Do something with the processed data
    })
    .catch(error => {
        console.error('Error in initialization:', error);
    });

         const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const filterBtn = document.getElementById('filter-btn');

    // Set max date to today for both inputs
    const today = new Date();
    const maxDate = today.toISOString().split('T')[0];

    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    const minDate = sevenDaysAgo.toISOString().split('T')[0];

    startDateInput.max = maxDate;
    startDateInput.min = minDate;
    endDateInput.max = maxDate;
    endDateInput.min = minDate;

    // Add event listener for the filter button
    filterBtn.addEventListener('click', () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        // Validate date selection
        if (!startDate && !endDate) {
            // If no dates selected, show current date data
            filterCharts(document.getElementById('department').value, new Date());
        } else if ((startDate && !endDate) || (!startDate && endDate)) {
            // If only one date is selected, show alert
            alert('Please select both start and end dates');
            return;
        } else if (startDate > endDate) {
            alert('Start date cannot be later than end date');
            return;
        } else {
            // Filter data based on selected date range
            filterCharts(document.getElementById('department').value, new Date(startDate), new Date(endDate));
        }
    });



//    // Initialize counts for each department
//    ['cardiology', 'neurology', 'orthopedics', 'pediatrics'].forEach(dept => {
//        departmentCounts.set(dept, {
//            currentCount: 0,
//            admissions: [],
//            discharges: []
//        });
//    });
        // Handle real-time data from socket
        socket.on('Hello', (data) => {
    //    console.log(data)
            const event = data.details;
    //        const timestamp = new Date(data.timestamp);
                const timestamp = data.timestamp
            // Store the data for later use in filters
          if (data.event_type === 'admission') {
            // Update department counts
            const deptData = departmentCounts.get(event.department);
            deptData.currentCount++;
            deptData.admissions.push({
                timestamp,
                count: deptData.currentCount,
                department: event.department,
                patient_id: event.patient_id,
                ...event
            });

            // Add to bed occupancy
            bedOccupancyData.set(event.patient_id, { ...event, timestamp });
            admissionData.push({ ...event, timestamp, count: deptData.currentCount });
        }

        if (data.event_type === 'discharge') {
            const deptData = departmentCounts.get(event.department);
            deptData.currentCount = Math.max(0, deptData.currentCount - 1); // Prevent negative counts
            deptData.discharges.push({
                timestamp,
                count: deptData.currentCount,
                department: event.department,
                patient_id: event.patient_id,
                ...event
            });

            // Remove from bed occupancy
            bedOccupancyData.delete(event.patient_id);
            dischargeData.push({ ...event, timestamp, count: deptData.currentCount });
        }
            if (data.event_type === 'billing') billingData.push({ ...event, timestamp });

           // Filter data based on current date selection
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;

        if (startDate && endDate) {
            filterCharts(document.getElementById('department').value, new Date(startDate), new Date(endDate));
        } else {
            filterCharts(document.getElementById('department').value, new Date());
        }




    });


        socket.on('error', (error) => {
            console.error('Socket error:', error);
            // Handle error without reloading the page
        });




        function filterCharts(department, startDate, endDate = null) {
//           const effectiveEndDate = endDate || startDate;
//
//        // Add one day to end date to include the entire end date
//        const adjustedEndDate = new Date(effectiveEndDate);
//        adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);

            const startOfDay = new Date(startDate);
            startOfDay.setHours(0, 0, 0, 0);

    // Set end of day (23:59:59.999) for end date
            const endOfDay = endDate ? new Date(endDate) : new Date(startDate);
            endOfDay.setHours(23, 59, 59, 999)
            // Filter admission data based on department and time interval
           // Filter admission data
        let filteredAdmissions = admissionData.filter(event => {
            const eventDate = new Date(event.timestamp);
             console.log(new Date(event.timestamp), "=================", startOfDay, "=================", endOfDay)
            if (department === 'all') {
                return eventDate >= startOfDay && eventDate <= endOfDay;
            }
            return event.department === department && eventDate >= startOfDay && eventDate <= endOfDay;
        });

        // Filter discharge data
        let filteredDischarges = dischargeData.filter(event => {
            const eventDate = new Date(event.timestamp);
            if (department === 'all') {
                return eventDate >= startOfDay && eventDate <= endOfDay;
            }
            return event.department === department && eventDate >= startOfDay && eventDate <= endOfDay;
        });

        // Update admission counts display
        document.getElementById('admission-cnt').innerText = filteredAdmissions.length;
        document.getElementById('discharge-cnt').innerText = filteredDischarges.length;
        console.log("-------------------------")
            console.log(filteredAdmissions)
            console.log(filteredDischarges)

        // Update admission chart
        let admissionsX = filteredAdmissions.map(event => event.timestamp);
        let admissionsY;

        if (department === 'all') {
            // For 'all', sum counts across departments at each timestamp
            const timestampCounts = new Map();
            filteredAdmissions.forEach(event => {
                const ts = event.timestamp;
                timestampCounts.set(ts, (timestampCounts.get(ts) || 0) + 1);
            });
            admissionsY = Array.from(timestampCounts.values());
        } else {
            // For specific department, use department counts
            admissionsY = filteredAdmissions.map(event => event.count);
        }

        admissionsChart.x = admissionsX;
        admissionsChart.y = admissionsY;
        Plotly.react('admissions-chart', [admissionsChart], {
            title: `Admissions Over Time for ${department} department`,
            xaxis: { tickangle: -45 },
            yaxis: { title: 'Count' }
        });

        // Update discharge chart
        let dischargesX = filteredDischarges.map(event => event.timestamp);
        let dischargesY;

        if (department === 'all') {
            // For 'all', sum counts across departments at each timestamp
            const timestampCounts = new Map();
            filteredDischarges.forEach(event => {
                const ts = event.timestamp;
                timestampCounts.set(ts, (timestampCounts.get(ts) || 0) + 1);
            });
            dischargesY = Array.from(timestampCounts.values());
        } else {
            // For specific department, use department counts
            dischargesY = filteredDischarges.map(event => event.count);
        }

        dischargesChart.x = dischargesX;
        dischargesChart.y = dischargesY;
        Plotly.react('discharges-chart', [dischargesChart], {
            title: `Discharge Over Time for ${department} department`,
            xaxis: { tickangle: -45 },
            yaxis: { title: 'Count' }
        });
            // Apply time and department filter for Bed Occupancy
    //


            let filteredBedData = Array.from(bedOccupancyData.values()).filter(event => {
                const eventDate = new Date(event.timestamp);
                return (department === 'all' || event.department === department) && eventDate >= startOfDay &&
                   eventDate <= endOfDay;;
            });
            let bedOccupancyCount = filteredBedData.reduce((acc, event) => {
                acc[event.department] = (acc[event.department] || 0) + 1;
                return acc;
            }, {});
            bedOccupancyChart.x = Object.keys(bedOccupancyCount);
            bedOccupancyChart.y = Object.values(bedOccupancyCount);
            Plotly.react('bed-occupancy-chart', [bedOccupancyChart], {
                title: 'Count of patients by Department',
                xaxis: { title: 'Department' },
                yaxis: { title: 'Count of Patients' }
            });



            // Step 1: Filter the billing data
    let filteredBillingData = billingData.filter(event => {
        const eventDate = new Date(event.timestamp);
        return (department === 'all' || event.department === department) && eventDate >= startOfDay &&
                   eventDate <= endOfDay;;
    });
    updateBillingTable(filteredBillingData);

    // Step 2: Organize data by department and timestamp
    // Update billing chart with theme
    let billingDataByDept = filteredBillingData.reduce((acc, event) => {
        if (!acc[event.department]) {
            acc[event.department] = [];
        }
        acc[event.department].push({
            timestamp: event.timestamp,
            amount: parseInt(event.amount)
        });
        return acc;
    }, {});

    // Create themed traces for each department
    const departmentColors = {
        'Cardiology': '#818cf8',
        'Neurology': '#c084fc',
        'Oncology': '#fb7185',
        'Pediatrics': '#34d399'
    };

    let traces = Object.keys(billingDataByDept).map((department, index) => ({
        x: billingDataByDept[department].map(event => event.timestamp),
        y: billingDataByDept[department].map(event => event.amount),
        type: 'scatter',
        mode: 'lines+markers',
        name: department,
        line: {
            color: departmentColors[department] || chartTheme.colorway[index % chartTheme.colorway.length],
            width: 3
        },
        marker: {
            size: 8,
            color: departmentColors[department] || chartTheme.colorway[index % chartTheme.colorway.length]
        }
    }));

    // Apply chart theme to billing chart
    Plotly.react('billing-chart', traces, {
        ...commonChartLayout,
        title: {
            text: 'Billing Amounts by Department Over Time',
            font: { size: 20, family: chartTheme.font.family }
        },
        xaxis: {
            tickangle: -45,
            showgrid: true,
            gridcolor: chartTheme.gridcolor,
            linecolor: chartTheme.linecolor
        },
        yaxis: {
            title: 'Billing Amount',
            showgrid: true,
            gridcolor: chartTheme.gridcolor,
            linecolor: chartTheme.linecolor
        },
        paper_bgcolor: chartTheme.paper_bgcolor,
        plot_bgcolor: chartTheme.plot_bgcolor,
        font: chartTheme.font
    });


    let avgBilling = filteredBillingData.reduce((sum, event) => sum + parseInt(event.amount), 0) / (filteredBillingData.length || 1);
//            document.getElementById('billing-avg').innerHTML = `<div class = 'kpi-value'>${avgBilling.toFixed(2)}</div> <div >Average Billing</div>` ;
document.getElementById('billing-avg').innerText = avgBilling.toFixed(2) ;

         let recoveryRate = calculateRecoveryRate(filteredDischarges);

            // Update recovery rate gauge
            Plotly.update('recovery-rate-chart', {
                'value': recoveryRate,
                'gauge.threshold.value': recoveryRate
            }, {
                'title.text': `Recovery Rate for ${department} department`
            });


            // Update bed occupancy statistics
            let totalBeds = 40
            if(department != 'all') totalBeds = 10
            let occupiedBeds = filteredBedData.length;
            let occupancyPercentage = (occupiedBeds / totalBeds) * 100;

            document.getElementById('bed-count').innerText = totalBeds;
            document.getElementById('occupied-bed-count').innerText = occupiedBeds;
            document.getElementById('percentage').innerText = occupancyPercentage.toFixed(2);


            // Check bed counts and show notifications
//            Object.entries(bedOccupancyCount).forEach(([dept, count]) => {
//                if (count === 5 || count === 8 || count === 10) {
//                    showNotification(`${dept} department has reached ${count} occupied beds!`);
//                }
//            });
            Object.entries(bedOccupancyCount).forEach(([dept, count]) => {
            if (count === 5) {
                showNotification(`${count*10}% beds of ${dept} department are occupied!`, `${dept}-5-beds`);
            } else if (count === 8) {
                showNotification(`${count*10}% beds of ${dept} department are occupied!`, `${dept}-8-beds`);
            } else if (count === 10) {
                showNotification(`${count*10}% beds of ${dept} department are occupied!`, `${dept}-10-beds`);
            }
        });

           //  let filteredData = [...filteredAdmissions, ...filteredDischarges];
              // Gender distribution
        let genderCounts = filteredAdmissions.reduce((acc, event) => {
            acc[event.gender] = (acc[event.gender] || 0) + 1;
            return acc;
        }, {Male: 0, Female: 0, Other: 0});

        genderChart.values = [genderCounts.Male, genderCounts.Female, genderCounts.Other];
        Plotly.react('gender-chart', [genderChart], {
            title: `Gender Distribution for ${department} department`
        });

        // Age distribution
        let ageCounts = filteredAdmissions.reduce((acc, event) => {
            let age = parseInt(event.age);
            if (age >= 1 && age <= 20) acc[0]++;
            else if (age <= 40) acc[1]++;
            else if (age <= 60) acc[2]++;
            else if (age <= 90) acc[3]++;
            return acc;
        }, [0, 0, 0, 0]);

        ageDistributionChart.values = ageCounts;
        Plotly.react('age-distribution-chart', [ageDistributionChart], {
            title: `Age Distribution for ${department} department`
        });


        }

        function updateBillingTable(filteredBillingData) {
    const tableBody = document.getElementById('billing-table-body');
    tableBody.innerHTML = ''; // Clear existing rows

    // Sort billing data by timestamp in descending order (most recent first)
    const sortedBillingData = [...filteredBillingData].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

    // Take only the most recent 10 entries
    const recentBillings = sortedBillingData.slice(0, 10);

    recentBillings.forEach(billing => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${billing.patient_id}</td>
            <td>${new Date(billing.timestamp).toLocaleString()}</td>
            <td>${billing.department}</td>
            <td>${billing.bed_id}</td>
            <td>$${parseInt(billing.amount).toFixed(2)}</td>
        `;
        tableBody.appendChild(row);
    });
}



//        function showNotification(message) {
//            if (activeNotifications.has(message)) {
//                // Update existing notification
//                const existingNotification = document.getElementById(activeNotifications.get(message));
//                const countSpan = existingNotification.querySelector('.notification-count');
//                let count = parseInt(countSpan.textContent);
//                countSpan.textContent = count + 1;
//
//                // Reset the removal timeout
//                clearTimeout(existingNotification.dataset.timeoutId);
//                const newTimeoutId = setTimeout(() => {
//                    closeNotification(activeNotifications.get(message));
//                }, 3000);
//                existingNotification.dataset.timeoutId = newTimeoutId;
//
//                // Highlight the notification briefly
//                existingNotification.classList.add('notification-update');
//                setTimeout(() => {
//                    existingNotification.classList.remove('notification-update');
//                }, 300);
//
//                return;
//            }
//
//            notificationCount++;
//            const notificationId = `notification-${notificationCount}`;
//
//            const notificationDiv = document.createElement('div');
//            notificationDiv.id = notificationId;
//            notificationDiv.className = 'notification';
//            notificationDiv.innerHTML = `
//                <p>${message} <span class="notification-count">1</span></p>
//                <button onclick="closeNotification('${notificationId}')">Close</button>
//            `;
//
//            document.body.appendChild(notificationDiv);
//
//            // Position the notification
//            setTimeout(() => {
//                notificationDiv.style.transform = `translateY(${activeNotifications.size * 100}px)`;
//                notificationDiv.style.opacity = '1';
//            }, 10);
//
//            activeNotifications.set(message, notificationId);
//
//            const timeoutId = setTimeout(() => {
//                closeNotification(notificationId);
//            }, 3000);
//            notificationDiv.dataset.timeoutId = timeoutId;
//        }
//
//        // Add this function to the global scope
//        window.closeNotification = function(id) {
//            const notification = document.getElementById(id);
//            if (notification) {
//                clearTimeout(notification.dataset.timeoutId);
//                notification.style.opacity = '0';
//                setTimeout(() => {
//                    notification.remove();
//                    const message = Array.from(activeNotifications.entries())
//                        .find(([_, v]) => v === id)?.[0];
//                    if (message) activeNotifications.delete(message);
//                    updateNotificationPositions();
//                }, 300);
//            }
//        };
//
//        function updateNotificationPositions() {
//            const notifications = document.querySelectorAll('.notification');
//            notifications.forEach((notification, index) => {
//                notification.style.transform = `translateY(${index * 100}px)`;
//            });
//        }

function showNotification(message, key) {
        // If this is a repeatable notification, check if it's already been shown
        if (key && shownNotifications.has(key)) {
            return; // Skip if this notification has already been shown
        }

        const timestamp = new Date().toLocaleString();

        // Add to notifications array
        notifications.unshift({
            message,
            timestamp,
            id: Date.now()
        });

        // If this is a repeatable notification, mark it as shown
        if (key) {
            shownNotifications.add(key);
        }

        // Keep only latest 10 notifications
        if (notifications.length > MAX_NOTIFICATIONS) {
            notifications = notifications.slice(0, MAX_NOTIFICATIONS);
        }

        // Update notification badge
        const badge = document.getElementById('notification-badge');
        badge.textContent = notifications.length;

        // Update notification list
        updateNotificationList();

        // Show popup notification
        const popup = document.createElement('div');
        popup.className = 'notification-popup';
        popup.innerHTML = `
            <div>
                <p>${message}</p>
                <p class="notification-time">${timestamp}</p>
            </div>
            <button class="close-btn">
                <i class="bx bx-x"></i>
            </button>
        `;

        document.body.appendChild(popup);

        // Show animation
        setTimeout(() => popup.classList.add('show'), 10);

        // Auto remove after 3 seconds
        setTimeout(() => {
            popup.classList.remove('show');
            setTimeout(() => popup.remove(), 300);
        }, 3000);

        // Handle close button
        popup.querySelector('.close-btn').addEventListener('click', () => {
            popup.classList.remove('show');
            setTimeout(() => popup.remove(), 300);
        });
    }
//function showNotification(message) {
//    const timestamp = new Date().toLocaleString();
//
//    // Add to notifications array
//    notifications.unshift({
//        message,
//        timestamp,
//        id: Date.now()
//    });
//
//    // Keep only latest 10 notifications
//    if (notifications.length > MAX_NOTIFICATIONS) {
//        notifications = notifications.slice(0, MAX_NOTIFICATIONS);
//    }
//
//    // Update notification badge
//    const badge = document.getElementById('notification-badge');
//    badge.textContent = notifications.length;
//
//    // Update notification list
//    updateNotificationList();
//
//    // Show popup notification
//    const popup = document.createElement('div');
//    popup.className = 'notification-popup';
//    popup.innerHTML = `
//        <div>
//            <p>${message}</p>
//            <p class="notification-time">${timestamp}</p>
//        </div>
//        <button class="close-btn">
//            <i class="bx bx-x"></i>
//        </button>
//    `;
//
//    document.body.appendChild(popup);
//
//    // Show animation
//    setTimeout(() => popup.classList.add('show'), 10);
//
//    // Auto remove after 3 seconds
//    setTimeout(() => {
//        popup.classList.remove('show');
//        setTimeout(() => popup.remove(), 300);
//    }, 3000);
//
//    // Handle close button
//    popup.querySelector('.close-btn').addEventListener('click', () => {
//        popup.classList.remove('show');
//        setTimeout(() => popup.remove(), 300);
//    });
//}

function updateNotificationList() {
    const list = document.getElementById('notification-list');
    list.innerHTML = notifications.map(notif => `
        <div class="notification-item">
            <div class="notification-content">
                <p>${notif.message}</p>
                <p class="notification-time">${notif.timestamp}</p>
            </div>
        </div>
    `).join('');
}

// Add event listener for clear notifications button
document.getElementById('clear-notifications').addEventListener('click', () => {
    notifications = [];
    document.getElementById('notification-badge').textContent = '0';
    updateNotificationList();
});

// Update the navigation handling to show/hide notification panel
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        const targetId = link.getAttribute('href').slice(1);
        document.querySelectorAll('section > div').forEach(div => {
            div.style.display = 'none';
        });
        document.getElementById(targetId).style.display = 'block';

        // Update active state
        document.querySelectorAll('.nav-link').forEach(l => {
            l.classList.remove('active');
        });
        link.classList.add('active');
    });
});
 function resetNotifications() {
        shownNotifications.clear();
    }

    // Add event listeners to reset notifications
    document.getElementById('filter-btn').addEventListener('click', resetNotifications);
    document.getElementById('department').addEventListener('change', resetNotifications);

        function calculateRecoveryRate(discharges) {
            if (discharges.length === 0) return 0;

            let stableDischarges = discharges.filter(d => d.discharge_summary === 'stable').length;
            return (stableDischarges / discharges.length) * 100;
        }


    });

